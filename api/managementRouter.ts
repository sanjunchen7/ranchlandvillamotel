import { z } from "zod";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { adminQuery, audit, staffQuery } from "./staff";
import { getDb } from "./queries/connection";
import { auditLogs, emailLogs, maintenanceBlocks, reservations, roomDailyRates, roomHolds, rooms, roomTypes, siteSettings, taxRules } from "@db/schema";
import { findConflicts, isInventoryDuplicate, releaseExpiredHolds, removeInventoryRows, writeInventoryRows, availability as findAvailableRooms } from "./services/inventory";
import { addDays, nightsBetween } from "./services/rules";
import { resendEmail } from "./services/email";

export const managementRouter = createRouter({
  rooms: staffQuery.query(async () => {
    const db = getDb();
    const [roomRows, types, active] = await Promise.all([
      db.select().from(rooms).orderBy(asc(rooms.roomNumber)), db.select().from(roomTypes),
      db.select().from(reservations).where(inArray(reservations.status, ["CONFIRMED", "CHECKED_IN"])),
    ]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
    const rates = await db.select().from(roomDailyRates).where(eq(roomDailyRates.rateDate, today));
    return roomRows.map((room) => ({
      ...room, roomType: types.find((t) => t.id === room.roomTypeId)?.name,
      tonightRate: rates.find((r) => r.roomId === room.id)?.rate ?? room.defaultRate,
      currentReservation: active.find((r) => r.assignedRoomId === room.id && r.checkIn <= today && r.checkOut > today)?.requestNumber ?? null,
    }));
  }),

  updateRoom: adminQuery.input(z.object({
    roomId: z.number().int().positive(), bedConfig: z.string().min(1).max(180), kitchen: z.boolean(),
    maxOccupancy: z.number().int().min(0).max(20), public: z.boolean(), active: z.boolean(),
    status: z.enum(["AVAILABLE", "INTERNAL"]), defaultRate: z.string().regex(/^\d+(\.\d{1,2})?$/), notes: z.string().max(3000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await getDb().update(rooms).set({ bedConfig: input.bedConfig, kitchen: input.kitchen, maxOccupancy: input.maxOccupancy, public: input.public, active: input.active, status: input.public ? input.status : "INTERNAL", defaultRate: input.defaultRate, notes: input.notes }).where(eq(rooms.id, input.roomId));
    await audit(ctx.staff.id, "ROOM_UPDATED", "room", input.roomId, { ...input });
    return { ok: true };
  }),

  createMaintenance: staffQuery.input(z.object({ roomId: z.number().int().positive(), startDate: z.string(), endDate: z.string(), reason: z.string().min(3).max(500) })).mutation(async ({ ctx, input }) => {
    if (input.endDate <= input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "Maintenance end date must be after its start date." });
    const result = await getDb().transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      await tx.select().from(rooms).where(eq(rooms.id, input.roomId)).for("update").limit(1);
      const conflicts = await findConflicts(tx, input.roomId, input.startDate, input.endDate);
      if (conflicts.hasConflict) throw new TRPCError({ code: "CONFLICT", message: `Maintenance blocked. Resolve affected reservations or holds first: ${conflicts.booked.map((r) => r.requestNumber).join(", ") || "active hold/maintenance"}.` });
      const [{ id }] = await tx.insert(maintenanceBlocks).values({ ...input, createdBy: ctx.staff.id }).$returningId();
      await writeInventoryRows(tx, "MAINTENANCE", id, input.roomId, input.startDate, input.endDate);
      return id;
    }).catch((error: unknown) => {
      if (isInventoryDuplicate(error)) throw new TRPCError({ code: "CONFLICT", message: "This room night was just occupied by another reservation, hold or maintenance block." });
      throw error;
    });
    await audit(ctx.staff.id, "MAINTENANCE_CREATED", "room", input.roomId, { startDate: input.startDate, endDate: input.endDate, reason: input.reason });
    return { ok: true, id: result };
  }),

  endMaintenance: staffQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await getDb().update(maintenanceBlocks).set({ releasedAt: new Date() }).where(eq(maintenanceBlocks.id, input.id));
    await removeInventoryRows(getDb(), "MAINTENANCE", input.id);
    await audit(ctx.staff.id, "MAINTENANCE_ENDED", "maintenance", input.id);
    return { ok: true };
  }),

  maintenance: staffQuery.query(async () => getDb().select().from(maintenanceBlocks).where(isNull(maintenanceBlocks.releasedAt)).orderBy(desc(maintenanceBlocks.createdAt))),

  walkInAvailability: staffQuery.input(z.object({
    checkIn: z.string(), checkOut: z.string(), adults: z.number().int().min(1), children: z.number().int().min(0),
    roomTypeId: z.number().int().positive().optional(), kitchenPreference: z.enum(["NO_PREFERENCE", "PREFER", "REQUIRED"]).default("NO_PREFERENCE"),
  })).query(async ({ input }) => {
    if (input.checkOut <= input.checkIn) return [];
    const available = await findAvailableRooms(input);
    return available.map((room) => ({ id: room.id, roomNumber: room.roomNumber, roomTypeId: room.roomTypeId, bedConfig: room.bedConfig, kitchen: room.kitchen, maxOccupancy: room.maxOccupancy, defaultRate: room.defaultRate }));
  }),

  availabilityCalendar: staffQuery.input(z.object({ startDate: z.string(), endDate: z.string() })).query(async ({ input }) => {
    const dates = nightsBetween(input.startDate, addDays(input.endDate, 1));
    if (!dates.length || dates.length > 14) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose between 1 and 14 days." });
    const db = getDb();
    const [roomRows, bookingRows, holdRows, maintenanceRows, rateRows] = await Promise.all([
      db.select().from(rooms).where(and(eq(rooms.public, true), eq(rooms.active, true))).orderBy(asc(rooms.roomNumber)),
      db.select().from(reservations).where(and(inArray(reservations.status, ["CONFIRMED", "CHECKED_IN", "AWAITING_GUARANTEE", "CARD_GUARANTEED"]), lte(reservations.checkIn, input.endDate), gte(reservations.checkOut, input.startDate))),
      db.select().from(roomHolds).where(and(isNull(roomHolds.releasedAt), gt(roomHolds.expiresAt, new Date()), lte(roomHolds.startDate, input.endDate), gte(roomHolds.endDate, input.startDate))),
      db.select().from(maintenanceBlocks).where(and(isNull(maintenanceBlocks.releasedAt), lte(maintenanceBlocks.startDate, input.endDate), gte(maintenanceBlocks.endDate, input.startDate))),
      db.select().from(roomDailyRates).where(and(gte(roomDailyRates.rateDate, input.startDate), lte(roomDailyRates.rateDate, input.endDate))),
    ]);
    return { dates, rooms: roomRows.map((room) => ({
      id: room.id, roomNumber: room.roomNumber,
      cells: dates.map((date) => {
        const maintenance = maintenanceRows.find((item) => item.roomId === room.id && item.startDate <= date && item.endDate > date);
        const booking = bookingRows.find((item) => item.assignedRoomId === room.id && ["CONFIRMED", "CHECKED_IN"].includes(item.status) && item.checkIn <= date && item.checkOut > date);
        const hold = holdRows.find((item) => item.roomId === room.id && item.startDate <= date && item.endDate > date);
        const heldBooking = hold ? bookingRows.find((item) => item.id === hold.reservationId) : undefined;
        return {
          date,
          status: maintenance ? "MAINTENANCE" as const : booking ? booking.status as "CONFIRMED" | "CHECKED_IN" : hold ? "HELD" as const : "AVAILABLE" as const,
          reservationId: booking?.id ?? heldBooking?.id,
          requestNumber: booking?.requestNumber ?? heldBooking?.requestNumber,
          guest: booking ? `${booking.firstName} ${booking.lastName}` : heldBooking ? `${heldBooking.firstName} ${heldBooking.lastName}` : undefined,
          rate: rateRows.find((item) => item.roomId === room.id && item.rateDate === date)?.rate ?? room.defaultRate,
        };
      }),
    })) };
  }),

  rates: staffQuery.input(z.object({ startDate: z.string(), endDate: z.string() })).query(async ({ input }) => {
    const nights = nightsBetween(input.startDate, addDays(input.endDate, 1));
    if (nights.length > 62) throw new TRPCError({ code: "BAD_REQUEST", message: "Please view no more than 62 days at once." });
    const db = getDb();
    const [roomRows, rates] = await Promise.all([
      db.select().from(rooms).where(and(eq(rooms.public, true), eq(rooms.active, true))).orderBy(asc(rooms.roomNumber)),
      db.select().from(roomDailyRates).where(and(gte(roomDailyRates.rateDate, input.startDate), lte(roomDailyRates.rateDate, input.endDate))),
    ]);
    return { rooms: roomRows, rates, dates: nights };
  }),

  batchRates: staffQuery.input(z.object({
    roomIds: z.array(z.number().int().positive()).min(1), startDate: z.string(), endDate: z.string(),
    rate: z.string().regex(/^\d+(\.\d{1,2})?$/), weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  })).mutation(async ({ ctx, input }) => {
    const dates = nightsBetween(input.startDate, addDays(input.endDate, 1)).filter((date) => !input.weekdays?.length || input.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()));
    if (!dates.length || dates.length > 366) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid range of up to 366 nights." });
    const db = getDb();
    for (const roomId of input.roomIds) for (const rateDate of dates) {
      await db.insert(roomDailyRates).values({ roomId, rateDate, rate: input.rate, updatedBy: ctx.staff.id }).onDuplicateKeyUpdate({ set: { rate: input.rate, updatedBy: ctx.staff.id } });
    }
    await audit(ctx.staff.id, "RATES_BATCH_UPDATED", "rate", undefined, { roomIds: input.roomIds, startDate: input.startDate, endDate: input.endDate, rate: input.rate, weekdays: input.weekdays });
    return { ok: true, updated: input.roomIds.length * dates.length };
  }),

  settings: staffQuery.query(async () => {
    const db = getDb();
    return { settings: await db.select().from(siteSettings), taxes: await db.select().from(taxRules).orderBy(asc(taxRules.id)) };
  }),

  updateSetting: adminQuery.input(z.object({ key: z.string().max(100), value: z.union([z.string(), z.number(), z.boolean()]) })).mutation(async ({ ctx, input }) => {
    const allowed = ["public_from_rate", "default_hold_hours", "standard_check_in", "earliest_early_check_in", "check_out", "front_desk_hours", "hero_text", "pet_copy", "late_arrival_copy", "ga4_enabled", "ga4_measurement_id"];
    if (!allowed.includes(input.key)) throw new TRPCError({ code: "FORBIDDEN", message: "This setting cannot be changed here." });
    if (input.key === "public_from_rate" && !/^\d+(\.\d{1,2})?$/.test(String(input.value))) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid nightly price." });
    await getDb().insert(siteSettings).values({ key: input.key, value: input.value, updatedBy: ctx.staff.id }).onDuplicateKeyUpdate({ set: { value: input.value, updatedBy: ctx.staff.id } });
    await audit(ctx.staff.id, "SETTING_UPDATED", "setting", input.key, { value: input.value });
    return { ok: true };
  }),

  saveTax: adminQuery.input(z.object({
    id: z.number().int().positive().optional(), name: z.string().min(2).max(120), enabled: z.boolean(),
    rate: z.string().regex(/^\d+(\.\d{1,4})?$/), effectiveDate: z.string(), endDate: z.string().optional(), appliesToFees: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    if (Number(input.rate) > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "Tax rate must be a percentage no greater than 100." });
    const db = getDb();
    if (input.id) await db.update(taxRules).set(input).where(eq(taxRules.id, input.id));
    else await db.insert(taxRules).values(input);
    await audit(ctx.staff.id, "TAX_RULE_SAVED", "tax", input.id, { ...input });
    return { ok: true };
  }),

  emails: staffQuery.query(async () => getDb().select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(100)),
  resendEmail: staffQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const result = await resendEmail(input.id);
    await audit(ctx.staff.id, "EMAIL_RESEND", "email", input.id, result);
    return result;
  }),

  audit: adminQuery.query(async () => getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200)),
});
