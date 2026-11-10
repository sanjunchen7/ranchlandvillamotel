import { and, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  maintenanceBlocks, reservations, reservationPriceItems, roomDailyRates, roomHolds, roomNightInventory, rooms, siteSettings, taxRules,
} from "@db/schema";
import { dollars, money, nightsBetween, rangesOverlap } from "./rules";
import { DEFAULT_SETTINGS } from "@contracts/business";

export type DbExecutor = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update" | "delete">;

export async function setting<T>(key: keyof typeof DEFAULT_SETTINGS): Promise<T> {
  const [row] = await getDb().select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return (row?.value ?? DEFAULT_SETTINGS[key]) as T;
}

export async function findConflicts(db: DbExecutor, roomId: number, checkIn: string, checkOut: string, excludeReservationId?: number) {
  const reservationConditions = [
    eq(reservations.assignedRoomId, roomId),
    inArray(reservations.status, ["CONFIRMED", "CHECKED_IN"] as const),
    lt(reservations.checkIn, checkOut),
    gt(reservations.checkOut, checkIn),
  ];
  if (excludeReservationId) reservationConditions.push(ne(reservations.id, excludeReservationId));
  const booked = await db.select({ id: reservations.id, requestNumber: reservations.requestNumber, status: reservations.status, checkIn: reservations.checkIn, checkOut: reservations.checkOut })
    .from(reservations).where(and(...reservationConditions));
  const held = await db.select().from(roomHolds).where(and(
    eq(roomHolds.roomId, roomId), isNull(roomHolds.releasedAt), gt(roomHolds.expiresAt, new Date()),
    lt(roomHolds.startDate, checkOut), gt(roomHolds.endDate, checkIn),
    excludeReservationId ? ne(roomHolds.reservationId, excludeReservationId) : undefined,
  ));
  const maintenance = await db.select().from(maintenanceBlocks).where(and(
    eq(maintenanceBlocks.roomId, roomId), isNull(maintenanceBlocks.releasedAt),
    lt(maintenanceBlocks.startDate, checkOut), gt(maintenanceBlocks.endDate, checkIn),
  ));
  return { booked, held, maintenance, hasConflict: booked.length + held.length + maintenance.length > 0 };
}

async function ratesForRoom(db: DbExecutor, room: typeof rooms.$inferSelect, checkIn: string, checkOut: string) {
  const nights = nightsBetween(checkIn, checkOut);
  const daily = await db.select().from(roomDailyRates).where(and(eq(roomDailyRates.roomId, room.id), inArray(roomDailyRates.rateDate, nights)));
  const byDate = new Map(daily.map((r) => [r.rateDate, r.rate]));
  return nights.map((date) => ({ date, rate: byDate.get(date) ?? room.defaultRate }));
}

async function taxesForNights(db: DbExecutor, nightly: { date: string; rate: string }[], feesCents = 0) {
  const rules = await db.select().from(taxRules).where(eq(taxRules.enabled, true));
  const subtotalCents = nightly.reduce((sum, item) => sum + money(item.rate), 0);
  const taxes = rules.map((rule) => {
    const roomBase = nightly.reduce((sum, item) => {
      if (item.date < rule.effectiveDate || (rule.endDate && item.date > rule.endDate)) return sum;
      return sum + money(item.rate);
    }, 0);
    const base = roomBase + (rule.appliesToFees ? feesCents : 0);
    // Tax is calculated on the order-level base per tax rule, then rounded once.
    return { name: rule.name, amountCents: Math.round(base * Number(rule.rate) / 100) };
  }).filter((tax) => tax.amountCents > 0);
  return { subtotalCents, feesCents, taxes, taxCents: taxes.reduce((sum, t) => sum + t.amountCents, 0) };
}

export async function quoteRoom(db: DbExecutor, room: typeof rooms.$inferSelect, checkIn: string, checkOut: string, feesCents = 0) {
  const nightly = await ratesForRoom(db, room, checkIn, checkOut);
  const totals = await taxesForNights(db, nightly, feesCents);
  return {
    nightly,
    subtotal: dollars(totals.subtotalCents),
    taxes: dollars(totals.taxCents),
    total: dollars(totals.subtotalCents + totals.taxCents + totals.feesCents),
    taxItems: totals.taxes.map((t) => ({ name: t.name, amount: dollars(t.amountCents) })),
  };
}

export async function availability(input: {
  checkIn: string; checkOut: string; adults: number; children: number;
  roomTypeId?: number; kitchenPreference?: "NO_PREFERENCE" | "PREFER" | "REQUIRED";
}) {
  const db = getDb();
  const guests = input.adults + input.children;
  const candidates = await db.select().from(rooms).where(and(
    eq(rooms.public, true), eq(rooms.active, true), ne(rooms.status, "INTERNAL"), ne(rooms.status, "MAINTENANCE"),
    input.roomTypeId ? eq(rooms.roomTypeId, input.roomTypeId) : undefined,
    input.kitchenPreference === "REQUIRED" ? eq(rooms.kitchen, true) : undefined,
  ));
  const available = [];
  for (const room of candidates) {
    if (room.maxOccupancy < guests) continue;
    const conflicts = await findConflicts(db, room.id, input.checkIn, input.checkOut);
    if (!conflicts.hasConflict) available.push(room);
  }
  return available;
}

export async function cheapestQuote(checkIn: string, checkOut: string, availableRooms: (typeof rooms.$inferSelect)[]) {
  const db = getDb();
  let cheapest: Awaited<ReturnType<typeof quoteRoom>> | null = null;
  for (const room of availableRooms) {
    const quote = await quoteRoom(db, room, checkIn, checkOut);
    if (!cheapest || money(quote.total) < money(cheapest.total)) cheapest = quote;
  }
  return cheapest;
}

export async function createPriceSnapshot(db: DbExecutor, reservationId: number, roomId: number, checkIn: string, checkOut: string, staffId: number, petFee?: string | null) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new Error("Assigned room not found.");
  const [current] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  const version = (current?.priceSnapshotVersion ?? 0) + 1;
  await db.update(reservationPriceItems).set({ active: false, supersededBy: version }).where(and(eq(reservationPriceItems.reservationId, reservationId), eq(reservationPriceItems.active, true)));
  const quote = await quoteRoom(db, room, checkIn, checkOut, petFee ? money(petFee) : 0);
  const items = [
    ...quote.nightly.map((night) => ({ reservationId, version, itemType: "NIGHT" as const, label: `Night of ${night.date}`, itemDate: night.date, amount: night.rate, createdBy: staffId })),
    ...quote.taxItems.map((tax) => ({ reservationId, version, itemType: "TAX" as const, label: tax.name, amount: tax.amount, createdBy: staffId })),
    ...(petFee && money(petFee) > 0 ? [{ reservationId, version, itemType: "FEE" as const, label: "Approved pet fee", amount: Number(petFee).toFixed(2), createdBy: staffId }] : []),
  ];
  await db.insert(reservationPriceItems).values(items);
  await db.update(reservations).set({ priceSnapshotVersion: version, estimatedSubtotal: quote.subtotal, estimatedTaxes: quote.taxes, estimatedTotal: quote.total }).where(eq(reservations.id, reservationId));
  return { version, quote };
}

export async function removeInventoryRows(db: DbExecutor, sourceType: "RESERVATION" | "HOLD" | "MAINTENANCE", sourceId: number) {
  await db.delete(roomNightInventory).where(and(eq(roomNightInventory.sourceType, sourceType), eq(roomNightInventory.sourceId, sourceId)));
}

export async function writeInventoryRows(db: DbExecutor, sourceType: "RESERVATION" | "HOLD" | "MAINTENANCE", sourceId: number, roomId: number, checkIn: string, checkOut: string, reservationId?: number) {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights.length) await db.insert(roomNightInventory).values(nights.map((stayDate) => ({ roomId, stayDate, sourceType, sourceId, reservationId })));
}

export async function releaseExpiredHolds(db: DbExecutor) {
  const expired = await db.select().from(roomHolds).where(and(isNull(roomHolds.releasedAt), lt(roomHolds.expiresAt, new Date())));
  for (const hold of expired) {
    await db.update(roomHolds).set({ releasedAt: new Date(), releaseReason: "Expired automatically" }).where(eq(roomHolds.id, hold.id));
    await removeInventoryRows(db, "HOLD", hold.id);
  }
}

export function isInventoryDuplicate(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current === "object") {
      if ("code" in current && current.code === "ER_DUP_ENTRY") return true;
      if (current instanceof Error && /duplicate entry|er_dup_entry|1062/i.test(current.message)) return true;
      current = "cause" in current ? current.cause : null;
    } else break;
  }
  return false;
}

export { rangesOverlap };
