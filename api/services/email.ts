import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { emailLogs, reservationPriceItems, reservations, rooms, roomTypes } from "@db/schema";
import { MOTEL } from "@contracts/business";

function transport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function deliver(logId: number) {
  const db = getDb();
  const [entry] = await db.select().from(emailLogs).where(eq(emailLogs.id, logId)).limit(1);
  if (!entry) return;
  const smtp = transport();
  if (!smtp) {
    await db.update(emailLogs).set({ status: "QUEUED", error: "SMTP is not configured. This message is saved in the outbox; no email was sent." }).where(eq(emailLogs.id, logId));
    return { delivered: false, reason: "SMTP_NOT_CONFIGURED" };
  }
  try {
    await smtp.sendMail({ from: process.env.SMTP_FROM || MOTEL.email, to: entry.recipient, subject: entry.subject, text: entry.body });
    await db.update(emailLogs).set({ status: "SENT", sentAt: new Date(), error: null }).where(eq(emailLogs.id, logId));
    return { delivered: true };
  } catch (error) {
    await db.update(emailLogs).set({ status: "FAILED", error: error instanceof Error ? error.message.slice(0, 2000) : "Email delivery failed" }).where(eq(emailLogs.id, logId));
    return { delivered: false, reason: "DELIVERY_FAILED" };
  }
}

export async function queueEmail(input: {
  reservationId?: number; recipient: string;
  emailType: "REQUEST_RECEIVED" | "CONFIRMATION" | "UPDATED_CONFIRMATION" | "FRONT_DESK_NOTIFICATION";
  snapshotVersion?: number; subject: string; body: string; deduplicate?: boolean;
}) {
  const db = getDb();
  if (input.deduplicate && input.reservationId) {
    const existing = await db.select().from(emailLogs).where(and(
      eq(emailLogs.reservationId, input.reservationId), eq(emailLogs.emailType, input.emailType),
      eq(emailLogs.snapshotVersion, input.snapshotVersion ?? 0), eq(emailLogs.recipient, input.recipient),
    )).limit(1);
    if (existing.length) return { id: existing[0].id, duplicate: true };
  }
  const [{ id }] = await db.insert(emailLogs).values({
    reservationId: input.reservationId, recipient: input.recipient, emailType: input.emailType,
    snapshotVersion: input.snapshotVersion ?? 0, subject: input.subject, body: input.body,
  }).$returningId();
  const result = await deliver(id);
  return { id, duplicate: false, ...result };
}

export async function resendEmail(id: number) {
  return deliver(id);
}

export function requestEmail(requestNumber: string, guest: string, checkIn: string, checkOut: string, roomType: string, requestedTime: string, guests: number) {
  return `${MOTEL.name}\n\nReservation Request Received\n\nRequest Number: ${requestNumber}\nGuest: ${guest}\nDates: ${checkIn} to ${checkOut}\nRequested Check-in Time: ${requestedTime}\nGuests: ${guests}\nRoom Type: ${roomType}\n\nYour reservation is not confirmed yet. Our front desk is reviewing your request. We may contact you to obtain a valid credit card to guarantee your reservation. Once confirmed, you will receive a confirmation email.\n\nAddress: ${MOTEL.address}\nCall: ${MOTEL.phone}\nText: ${MOTEL.text}\nEmail: ${MOTEL.email}`;
}

export async function confirmationEmail(reservationId: number, updated = false) {
  const db = getDb();
  const [r] = await db.select().from(reservations).where(eq(reservations.id, reservationId)).limit(1);
  if (!r) throw new Error("Reservation not found.");
  const [type] = await db.select().from(roomTypes).where(eq(roomTypes.id, r.roomTypeId)).limit(1);
  const [room] = r.assignedRoomId ? await db.select().from(rooms).where(eq(rooms.id, r.assignedRoomId)).limit(1) : [null];
  const prices = await db.select().from(reservationPriceItems).where(and(eq(reservationPriceItems.reservationId, reservationId), eq(reservationPriceItems.active, true)));
  const nightly = prices.filter((item) => item.itemType === "NIGHT").map((item) => `${item.itemDate}: CA$${item.amount}`).join("\n");
  const fees = prices.filter((item) => item.itemType === "FEE").map((item) => `${item.label}: CA$${item.amount}`).join("\n") || "None";
  return `${updated ? "Updated Confirmation" : "Reservation Confirmation"}\n${MOTEL.name}\n${MOTEL.address}\n\nReservation Number: ${r.requestNumber}\nGuest: ${r.firstName} ${r.lastName}\nCheck-in Date: ${r.checkIn}\nConfirmed Check-in Time: ${r.confirmedCheckInTime || "2:00 PM"}\nCheck-out Date: ${r.checkOut}\nGuests: ${r.adults + r.children}${r.infants ? ` + ${r.infants} infant(s)` : ""}\nRoom Type: ${type?.name || "Reserved room"}\nAssigned Room Number: ${room?.roomNumber || "Assigned by front desk"}\nKitchen: ${room?.kitchen ? "Yes" : r.kitchenPreference === "REQUIRED" ? "Requested — confirmed by front desk" : "No / not requested"}\n\nNightly Rate:\n${nightly || "See confirmed subtotal"}\n\nSubtotal: CA$${r.estimatedSubtotal}\nTaxes: CA$${r.estimatedTaxes}\nApproved Fees:\n${fees}\nTotal: CA$${r.estimatedTotal}\nPayment: Pay at Property\nReservation guarantee verified by front desk.\n\nStandard check-in begins at 2:00 PM. Early check-in may be available from 12:00 PM when approved by the front desk.\nCheck-out: 11:00 AM\nIf you expect to arrive late, please contact the front desk in advance to arrange key pickup.\n\nCall: ${MOTEL.phone}\nText: ${MOTEL.text}\nEmail: ${MOTEL.email}`;
}
