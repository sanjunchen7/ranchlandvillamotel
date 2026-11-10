import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { adminQuery, audit, staffQuery } from "./staff";
import { getDb } from "./queries/connection";
import {
  emailLogs, reservationGuarantees, reservationGuests, reservationPriceItems, reservationStatusHistory,
  reservations, roomHolds, roomTypes, rooms,
} from "@db/schema";
import { availability, createPriceSnapshot, findConflicts, isInventoryDuplicate, quoteRoom, releaseExpiredHolds, removeInventoryRows, setting, writeInventoryRows } from "./services/inventory";
import { canTransition, money, motelToday, safeCardLast4, validateStay } from "./services/rules";
import { confirmationEmail, queueEmail } from "./services/email";
import { MOTEL, type ReservationStatus } from "@contracts/business";

const idInput = z.object({ reservationId: z.number().int().positive() });
const statusSchema = z.enum(["REQUESTED", "REVIEWING", "AWAITING_GUARANTEE", "CARD_GUARANTEED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "DECLINED", "CANCELLED", "NO_SHOW"]);

async function getReservation(id: number) {
  const [reservation] = await getDb().select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!reservation) throw new TRPCError({ code: "NOT_FOUND", message: "Reservation not found." });
  return reservation;
}

async function history(reservationId: number, from: string | null, to: string, staffId: number, reason?: string) {
  await getDb().insert(reservationStatusHistory).values({ reservationId, fromStatus: from, toStatus: to, changedBy: staffId, reason });
}

async function releaseHolds(reservationId: number, reason: string) {
  const db = getDb();
  const active = await db.select().from(roomHolds).where(and(eq(roomHolds.reservationId, reservationId), isNull(roomHolds.releasedAt)));
  await db.update(roomHolds).set({ releasedAt: new Date(), releaseReason: reason }).where(and(eq(roomHolds.reservationId, reservationId), isNull(roomHolds.releasedAt)));
  for (const hold of active) await removeInventoryRows(db, "HOLD", hold.id);
}

function duplicateConflict(error: unknown): never {
  if (isInventoryDuplicate(error)) throw new TRPCError({ code: "CONFLICT", message: "Another reservation, hold or maintenance block was saved for this room night. No overbooking was created." });
  throw error;
}

async function sendConfirmation(reservationId: number, version: number, updated = false) {
  const reservation = await getReservation(reservationId);
  const body = await confirmationEmail(reservationId, updated);
  try {
    await queueEmail({ reservationId, recipient: reservation.email, emailType: updated ? "UPDATED_CONFIRMATION" : "CONFIRMATION", snapshotVersion: version, subject: `${updated ? "Updated Confirmation" : "Reservation Confirmed"} — ${reservation.requestNumber}`, body, deduplicate: true });
  } catch { /* Status changes are never rolled back by email delivery. */ }
}

export const reservationRouter = createRouter({
  dashboard: staffQuery.query(async () => {
    const db = getDb();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: MOTEL.timezone }).format(new Date());
    const [all, publicRooms, activeHolds] = await Promise.all([
      db.select().from(reservations), db.select().from(rooms).where(and(eq(rooms.public, true), eq(rooms.active, true))),
      db.select().from(roomHolds).where(and(isNull(roomHolds.releasedAt), gt(roomHolds.expiresAt, new Date()))),
    ]);
    const count = (status: ReservationStatus) => all.filter((r) => r.status === status).length;
    const occupiedIds = new Set(all.filter((r) => ["CONFIRMED", "CHECKED_IN"].includes(r.status) && r.checkIn <= today && r.checkOut > today).map((r) => r.assignedRoomId));
    const heldRoomIds = new Set(activeHolds.filter((h) => h.startDate <= today && h.endDate > today).map((h) => h.roomId));
    return {
      arrivals: all.filter((r) => r.checkIn === today && ["CONFIRMED", "CHECKED_IN"].includes(r.status)).length,
      departures: all.filter((r) => r.checkOut === today && ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(r.status)).length,
      inHouse: count("CHECKED_IN"), requests: count("REQUESTED") + count("REVIEWING"),
      awaitingGuarantee: count("AWAITING_GUARANTEE") + count("CARD_GUARANTEED"), confirmed: count("CONFIRMED"),
      occupied: occupiedIds.size, outOfService: publicRooms.filter((r) => r.status === "MAINTENANCE").length,
      available: publicRooms.filter((r) => r.status === "AVAILABLE" && !occupiedIds.has(r.id) && !heldRoomIds.has(r.id)).length,
      pendingEmails: (await db.select().from(emailLogs).where(inArray(emailLogs.status, ["QUEUED", "FAILED"]))).length,
    };
  }),

  list: staffQuery.input(z.object({ search: z.string().max(150).optional(), status: statusSchema.optional() })).query(async ({ input }) => {
    const db = getDb();
    const term = input.search?.trim();
    return db.select({ reservation: reservations, roomType: roomTypes.name, roomNumber: rooms.roomNumber })
      .from(reservations).innerJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id)).leftJoin(rooms, eq(reservations.assignedRoomId, rooms.id))
      .where(and(input.status ? eq(reservations.status, input.status) : undefined, term ? or(like(reservations.requestNumber, `%${term}%`), like(reservations.firstName, `%${term}%`), like(reservations.lastName, `%${term}%`), like(reservations.phone, `%${term}%`), like(reservations.email, `%${term}%`)) : undefined))
      .orderBy(desc(reservations.createdAt)).limit(250);
  }),

  detail: staffQuery.input(idInput).query(async ({ input }) => {
    const db = getDb();
    const reservation = await getReservation(input.reservationId);
    const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, reservation.roomTypeId)).limit(1);
    const [assigned] = reservation.assignedRoomId ? await db.select().from(rooms).where(eq(rooms.id, reservation.assignedRoomId)).limit(1) : [null];
    const [guarantees, prices, statuses, holds, emails] = await Promise.all([
      db.select().from(reservationGuarantees).where(eq(reservationGuarantees.reservationId, input.reservationId)).orderBy(desc(reservationGuarantees.createdAt)),
      db.select().from(reservationPriceItems).where(and(eq(reservationPriceItems.reservationId, input.reservationId), eq(reservationPriceItems.active, true))),
      db.select().from(reservationStatusHistory).where(eq(reservationStatusHistory.reservationId, input.reservationId)).orderBy(desc(reservationStatusHistory.createdAt)),
      db.select().from(roomHolds).where(eq(roomHolds.reservationId, input.reservationId)).orderBy(desc(roomHolds.createdAt)),
      db.select().from(emailLogs).where(eq(emailLogs.reservationId, input.reservationId)).orderBy(desc(emailLogs.createdAt)).limit(20),
    ]);
    const sms = `${MOTEL.name}: Your reservation ${reservation.requestNumber} is confirmed for ${reservation.checkIn}–${reservation.checkOut}. Check-in: ${reservation.confirmedCheckInTime || "2:00 PM"}. Address: ${MOTEL.address}. For late arrival, contact the front desk at ${MOTEL.phone}.`;
    return { reservation, roomType: type, assignedRoom: assigned, guarantees, prices, statuses, holds, emails, sms };
  }),

  availableRooms: staffQuery.input(idInput).query(async ({ input }) => {
    const r = await getReservation(input.reservationId);
    const list = await availability({ checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults, children: r.children, roomTypeId: r.roomTypeId, kitchenPreference: r.kitchenPreference });
    if (r.assignedRoomId && !list.some((room) => room.id === r.assignedRoomId)) {
      const [current] = await getDb().select().from(rooms).where(eq(rooms.id, r.assignedRoomId)).limit(1);
      if (current) list.push(current);
    }
    return list.map((room) => ({ id: room.id, roomNumber: room.roomNumber, bedConfig: room.bedConfig, kitchen: room.kitchen, maxOccupancy: room.maxOccupancy }));
  }),

  assignRoom: staffQuery.input(idInput.extend({ roomId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    if (["CHECKED_IN", "CHECKED_OUT", "CANCELLED", "DECLINED", "NO_SHOW"].includes(r.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This reservation can no longer be assigned." });
    const [room] = await getDb().select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
    if (!room || !room.public || !room.active || room.roomTypeId !== r.roomTypeId) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected room does not match this reservation." });
    if (r.kitchenPreference === "REQUIRED" && !room.kitchen) throw new TRPCError({ code: "BAD_REQUEST", message: "Kitchen is required for this reservation." });
    await getDb().update(reservations).set({ assignedRoomId: input.roomId }).where(eq(reservations.id, r.id));
    await audit(ctx.staff.id, "ROOM_ASSIGNED", "reservation", r.id, { roomNumber: room.roomNumber });
    return { ok: true };
  }),

  transition: staffQuery.input(idInput.extend({ toStatus: statusSchema, reason: z.string().max(1000).optional(), overrideReason: z.string().min(5).max(1000).optional() })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    if (input.toStatus === "CONFIRMED") {
      const isOverride = r.status === "AWAITING_GUARANTEE";
      if (isOverride && (ctx.staff.role !== "ADMIN" || !input.overrideReason)) throw new TRPCError({ code: "FORBIDDEN", message: "Admin override with a reason is required to confirm without a card guarantee." });
      if (!isOverride && !canTransition(r.status, input.toStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move ${r.status} to CONFIRMED.` });
      if (!r.assignedRoomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign a room before confirming." });
      const result = await getDb().transaction(async (tx) => {
        await releaseExpiredHolds(tx);
        const [lockedRoom] = await tx.select().from(rooms).where(eq(rooms.id, r.assignedRoomId!)).for("update").limit(1);
        if (!lockedRoom) throw new TRPCError({ code: "NOT_FOUND", message: "Assigned room not found." });
        const conflicts = await findConflicts(tx, lockedRoom.id, r.checkIn, r.checkOut, r.id);
        if (conflicts.hasConflict) throw new TRPCError({ code: "CONFLICT", message: "This room now has a conflicting reservation, hold or maintenance block. Choose another room." });
        if (!isOverride) {
          const [guarantee] = await tx.select().from(reservationGuarantees).where(and(eq(reservationGuarantees.reservationId, r.id), inArray(reservationGuarantees.status, ["VERIFIED", "PREAUTHORIZED"]))).limit(1);
          if (!guarantee) throw new TRPCError({ code: "BAD_REQUEST", message: "A verified or pre-authorized guarantee is required." });
        }
        const ownHolds = await tx.select().from(roomHolds).where(and(eq(roomHolds.reservationId, r.id), isNull(roomHolds.releasedAt)));
        for (const hold of ownHolds) await removeInventoryRows(tx, "HOLD", hold.id);
        await writeInventoryRows(tx, "RESERVATION", r.id, lockedRoom.id, r.checkIn, r.checkOut, r.id);
        const snapshot = await createPriceSnapshot(tx, r.id, lockedRoom.id, r.checkIn, r.checkOut, ctx.staff.id, r.petFee);
        await tx.update(reservations).set({ status: "CONFIRMED", confirmedAt: new Date(), confirmedCheckInTime: r.confirmedCheckInTime || r.preferredCheckInTime }).where(eq(reservations.id, r.id));
        await tx.update(roomHolds).set({ releasedAt: new Date(), releaseReason: "Converted to confirmed reservation" }).where(and(eq(roomHolds.reservationId, r.id), isNull(roomHolds.releasedAt)));
        await tx.insert(reservationStatusHistory).values({ reservationId: r.id, fromStatus: r.status, toStatus: "CONFIRMED", changedBy: ctx.staff.id, reason: isOverride ? input.overrideReason : input.reason });
        if (isOverride) await tx.insert(reservationGuarantees).values({ reservationId: r.id, status: "OVERRIDE", method: "FRONT_DESK_OVERRIDE", verificationDate: new Date(), verifiedBy: ctx.staff.id, notes: input.overrideReason });
        return snapshot;
      }).catch(duplicateConflict);
      await audit(ctx.staff.id, isOverride ? "CONFIRM_OVERRIDE" : "RESERVATION_CONFIRMED", "reservation", r.id, { version: result.version, reason: input.overrideReason });
      await sendConfirmation(r.id, result.version);
      return { ok: true };
    }
    if (!canTransition(r.status, input.toStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move ${r.status} to ${input.toStatus}.` });
    if (["DECLINED", "CANCELLED", "NO_SHOW"].includes(input.toStatus) && !input.reason) throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide a reason." });
    const updates: Partial<typeof reservations.$inferInsert> = { status: input.toStatus };
    if (input.toStatus === "CHECKED_IN") updates.checkedInAt = new Date();
    if (input.toStatus === "CHECKED_OUT") updates.checkedOutAt = new Date();
    if (input.toStatus === "NO_SHOW") {
      const [firstNight] = await getDb().select().from(reservationPriceItems).where(and(eq(reservationPriceItems.reservationId, r.id), eq(reservationPriceItems.active, true), eq(reservationPriceItems.itemType, "NIGHT"))).limit(1);
      updates.noShowChargeStatus = "PENDING";
      updates.noShowChargedAmount = firstNight?.amount || null;
    }
    await getDb().update(reservations).set(updates).where(eq(reservations.id, r.id));
    await history(r.id, r.status, input.toStatus, ctx.staff.id, input.reason);
    if (["CANCELLED", "DECLINED"].includes(input.toStatus)) await releaseHolds(r.id, input.toStatus);
    if (["CANCELLED", "DECLINED", "NO_SHOW", "CHECKED_OUT"].includes(input.toStatus)) await removeInventoryRows(getDb(), "RESERVATION", r.id);
    await audit(ctx.staff.id, `STATUS_${input.toStatus}`, "reservation", r.id, { reason: input.reason });
    return { ok: true };
  }),

  recordGuarantee: staffQuery.input(idInput.extend({
    status: z.enum(["VERIFIED", "PREAUTHORIZED"]), cardBrand: z.string().max(30).optional(), cardLast4: z.string().max(4).optional(),
    guaranteeAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), providerReference: z.string().max(255).optional(), notes: z.string().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    if (!safeCardLast4(input.cardLast4)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only the last four digits may be recorded." });
    const r = await getReservation(input.reservationId);
    if (!["AWAITING_GUARANTEE", "CARD_GUARANTEED"].includes(r.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Move the request to Awaiting Guarantee first." });
    await getDb().insert(reservationGuarantees).values({
      reservationId: r.id, status: input.status, method: input.status === "VERIFIED" ? "CARD_VERIFIED" : "PREAUTHORIZED",
      cardBrand: input.cardBrand, cardLast4: input.cardLast4, guaranteeAmount: input.guaranteeAmount,
      providerReference: input.providerReference, notes: input.notes, verificationDate: new Date(), verifiedBy: ctx.staff.id,
    });
    if (r.status === "AWAITING_GUARANTEE") {
      await getDb().update(reservations).set({ status: "CARD_GUARANTEED" }).where(eq(reservations.id, r.id));
      await history(r.id, r.status, "CARD_GUARANTEED", ctx.staff.id, "Guarantee recorded by front desk");
    }
    await audit(ctx.staff.id, "GUARANTEE_RECORDED", "reservation", r.id, { status: input.status, last4: input.cardLast4 });
    return { ok: true };
  }),

  approveEarlyCheckIn: staffQuery.input(idInput.extend({ approved: z.boolean(), confirmedTime: z.string() })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    await getDb().update(reservations).set({ earlyCheckInStatus: input.approved ? "APPROVED" : "NOT_APPROVED", confirmedCheckInTime: input.approved ? input.confirmedTime : "2:00 PM" }).where(eq(reservations.id, r.id));
    await audit(ctx.staff.id, "EARLY_CHECKIN_DECISION", "reservation", r.id, { approved: input.approved, confirmedTime: input.confirmedTime });
    return { ok: true };
  }),

  createHold: staffQuery.input(idInput.extend({ hours: z.number().int().min(1).max(168).optional() })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    if (!["AWAITING_GUARANTEE", "CARD_GUARANTEED"].includes(r.status) || !r.assignedRoomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign a room and move the request to Awaiting Guarantee before holding it." });
    const hours = input.hours ?? await setting<number>("default_hold_hours");
    const hold = await getDb().transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      await tx.select().from(rooms).where(eq(rooms.id, r.assignedRoomId!)).for("update").limit(1);
      const conflicts = await findConflicts(tx, r.assignedRoomId!, r.checkIn, r.checkOut, r.id);
      if (conflicts.hasConflict) throw new TRPCError({ code: "CONFLICT", message: "The room is no longer available for these dates." });
      const previous = await tx.select().from(roomHolds).where(and(eq(roomHolds.reservationId, r.id), isNull(roomHolds.releasedAt)));
      for (const item of previous) await removeInventoryRows(tx, "HOLD", item.id);
      await tx.update(roomHolds).set({ releasedAt: new Date(), releaseReason: "Replaced by a new hold" }).where(and(eq(roomHolds.reservationId, r.id), isNull(roomHolds.releasedAt)));
      const [{ id }] = await tx.insert(roomHolds).values({ reservationId: r.id, roomId: r.assignedRoomId!, startDate: r.checkIn, endDate: r.checkOut, expiresAt: new Date(Date.now() + hours * 3600000), createdBy: ctx.staff.id }).$returningId();
      await writeInventoryRows(tx, "HOLD", id, r.assignedRoomId!, r.checkIn, r.checkOut, r.id);
      return { id, hours };
    }).catch(duplicateConflict);
    await audit(ctx.staff.id, "HOLD_CREATED", "reservation", r.id, hold);
    return { ok: true, ...hold };
  }),

  releaseHold: staffQuery.input(z.object({ holdId: z.number().int().positive(), reason: z.string().min(3).max(255) })).mutation(async ({ ctx, input }) => {
    await getDb().update(roomHolds).set({ releasedAt: new Date(), releaseReason: input.reason }).where(eq(roomHolds.id, input.holdId));
    await removeInventoryRows(getDb(), "HOLD", input.holdId);
    await audit(ctx.staff.id, "HOLD_RELEASED", "hold", input.holdId, { reason: input.reason });
    return { ok: true };
  }),

  editStay: staffQuery.input(idInput.extend({
    checkIn: z.string(), checkOut: z.string(), assignedRoomId: z.number().int().positive(),
    petFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), internalNotes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    if (["CHECKED_IN", "CHECKED_OUT", "CANCELLED", "DECLINED", "NO_SHOW"].includes(r.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "This reservation can no longer be edited." });
    if (input.checkOut <= input.checkIn) throw new TRPCError({ code: "BAD_REQUEST", message: "Check-out must be after check-in." });
    const [room] = await getDb().select().from(rooms).where(eq(rooms.id, input.assignedRoomId)).limit(1);
    if (!room || room.roomTypeId !== r.roomTypeId || (r.kitchenPreference === "REQUIRED" && !room.kitchen)) throw new TRPCError({ code: "BAD_REQUEST", message: "The room does not match the reservation requirements." });
    const changed = r.checkIn !== input.checkIn || r.checkOut !== input.checkOut || r.assignedRoomId !== input.assignedRoomId || (input.petFee ?? r.petFee) !== r.petFee;
    const snapshot = await getDb().transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      await tx.select().from(rooms).where(eq(rooms.id, room.id)).for("update").limit(1);
      const conflicts = await findConflicts(tx, room.id, input.checkIn, input.checkOut, r.id);
      if (conflicts.hasConflict) throw new TRPCError({ code: "CONFLICT", message: "The new dates or room conflict with another booking, hold or maintenance block." });
      await tx.update(reservations).set({ checkIn: input.checkIn, checkOut: input.checkOut, assignedRoomId: room.id, petFee: input.petFee ?? r.petFee, internalNotes: input.internalNotes ?? r.internalNotes }).where(eq(reservations.id, r.id));
      if (r.status === "CONFIRMED" && changed) {
        const ownHolds = await tx.select().from(roomHolds).where(and(eq(roomHolds.reservationId, r.id), isNull(roomHolds.releasedAt)));
        for (const hold of ownHolds) await removeInventoryRows(tx, "HOLD", hold.id);
        await removeInventoryRows(tx, "RESERVATION", r.id);
        await writeInventoryRows(tx, "RESERVATION", r.id, room.id, input.checkIn, input.checkOut, r.id);
        return createPriceSnapshot(tx, r.id, room.id, input.checkIn, input.checkOut, ctx.staff.id, input.petFee ?? r.petFee);
      }
      if (!r.priceSnapshotVersion) {
        const quote = await quoteRoom(tx, room, input.checkIn, input.checkOut, input.petFee ? money(input.petFee) : 0);
        await tx.update(reservations).set({ estimatedSubtotal: quote.subtotal, estimatedTaxes: quote.taxes, estimatedTotal: quote.total }).where(eq(reservations.id, r.id));
      }
      return null;
    }).catch(duplicateConflict);
    await audit(ctx.staff.id, "RESERVATION_EDITED", "reservation", r.id, { checkIn: input.checkIn, checkOut: input.checkOut, roomId: room.id, newVersion: snapshot?.version });
    if (snapshot) await sendConfirmation(r.id, snapshot.version, true);
    return { ok: true };
  }),

  createWalkIn: adminQuery.input(z.object({
    checkIn: z.string(), checkOut: z.string(), roomId: z.number().int().positive(),
    adults: z.number().int().min(1).max(10), children: z.number().int().min(0).max(10), infants: z.number().int().min(0).max(20),
    firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(50).optional(), email: z.string().trim().email().optional().or(z.literal("")),
    preferredCheckInTime: z.string().default("2:00 PM"), kitchenPreference: z.enum(["NO_PREFERENCE", "PREFER", "REQUIRED"]).default("NO_PREFERENCE"),
    pets: z.boolean().default(false), petFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    overrideReason: z.string().trim().min(5).max(1000), internalNotes: z.string().max(3000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const errors = validateStay({ ...input, preferredCheckInTime: input.preferredCheckInTime });
    if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors[0] });
    const db = getDb();
    const requestNumber = `RV-${motelToday().replaceAll("-", "")}-M${randomUUID().slice(0, 5).toUpperCase()}`;
    const result = await db.transaction(async (tx) => {
      await releaseExpiredHolds(tx);
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId)).for("update").limit(1);
      if (!room || !room.public || !room.active || room.status !== "AVAILABLE") throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active public room." });
      if (room.maxOccupancy < input.adults + input.children) throw new TRPCError({ code: "BAD_REQUEST", message: `Room ${room.roomNumber} allows up to ${room.maxOccupancy} guests, excluding infants.` });
      if (input.kitchenPreference === "REQUIRED" && !room.kitchen) throw new TRPCError({ code: "BAD_REQUEST", message: "This room does not have a kitchen." });
      const conflicts = await findConflicts(tx, room.id, input.checkIn, input.checkOut);
      if (conflicts.hasConflict) throw new TRPCError({ code: "CONFLICT", message: `Room ${room.roomNumber} is occupied, held or under maintenance for these dates.` });
      const [{ id: reservationId }] = await tx.insert(reservations).values({
        requestNumber, status: "CONFIRMED", checkIn: input.checkIn, checkOut: input.checkOut,
        preferredCheckInTime: input.preferredCheckInTime, confirmedCheckInTime: input.preferredCheckInTime,
        adults: input.adults, children: input.children, infants: input.infants, pets: input.pets,
        roomTypeId: room.roomTypeId, assignedRoomId: room.id, kitchenPreference: input.kitchenPreference,
        earlyCheckInStatus: input.preferredCheckInTime === "2:00 PM" ? "NOT_REQUESTED" : "APPROVED",
        firstName: input.firstName, lastName: input.lastName, phone: input.phone || "Not provided",
        email: input.email || `walkin-${requestNumber.toLowerCase()}@invalid.example`, petFee: input.petFee,
        internalNotes: `[MANUAL WALK-IN] ${input.overrideReason}${input.internalNotes ? `\n${input.internalNotes}` : ""}`,
        confirmedAt: new Date(),
      }).$returningId();
      await writeInventoryRows(tx, "RESERVATION", reservationId, room.id, input.checkIn, input.checkOut, reservationId);
      const snapshot = await createPriceSnapshot(tx, reservationId, room.id, input.checkIn, input.checkOut, ctx.staff.id, input.petFee);
      await tx.insert(reservationGuarantees).values({ reservationId, status: "OVERRIDE", method: "FRONT_DESK_OVERRIDE", verificationDate: new Date(), verifiedBy: ctx.staff.id, notes: input.overrideReason });
      await tx.insert(reservationStatusHistory).values({ reservationId, fromStatus: null, toStatus: "CONFIRMED", changedBy: ctx.staff.id, reason: `Manual walk-in: ${input.overrideReason}` });
      await tx.update(reservations).set({ status: "CHECKED_IN", checkedInAt: new Date() }).where(eq(reservations.id, reservationId));
      await tx.insert(reservationStatusHistory).values({ reservationId, fromStatus: "CONFIRMED", toStatus: "CHECKED_IN", changedBy: ctx.staff.id, reason: "Walk-in guest checked in by front desk" });
      await tx.insert(reservationGuests).values({ reservationId, firstName: input.firstName, lastName: input.lastName, isPrimary: true });
      return { reservationId, requestNumber, version: snapshot.version };
    }).catch(duplicateConflict);
    await audit(ctx.staff.id, "WALKIN_CREATED_CHECKED_IN", "reservation", result.reservationId, { requestNumber, roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut, reason: input.overrideReason });
    return result;
  }),

  recordNoShowCharge: staffQuery.input(idInput.extend({
    status: z.enum(["CHARGED", "WAIVED", "FAILED"]), amount: z.string().regex(/^\d+(\.\d{1,2})?$/), providerReference: z.string().max(255).optional(),
  })).mutation(async ({ ctx, input }) => {
    const r = await getReservation(input.reservationId);
    if (r.status !== "NO_SHOW") throw new TRPCError({ code: "BAD_REQUEST", message: "Charges can only be recorded for a no-show reservation." });
    await getDb().update(reservations).set({ noShowChargeStatus: input.status, noShowChargedAmount: input.amount, internalNotes: [r.internalNotes, `No-show charge: ${input.status}; provider reference: ${input.providerReference || "not recorded"}`].filter(Boolean).join("\n") }).where(eq(reservations.id, r.id));
    await audit(ctx.staff.id, "NOSHOW_CHARGE_RECORDED", "reservation", r.id, { status: input.status, amount: input.amount, providerReference: input.providerReference });
    return { ok: true };
  }),
});
