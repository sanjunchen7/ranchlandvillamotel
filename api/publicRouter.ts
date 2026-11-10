import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { media, reservationGuests, reservations, roomTypeMedia, roomTypes, siteMedia, siteSettings } from "@db/schema";
import { availability, cheapestQuote } from "./services/inventory";
import { motelToday, timeToMinutes, validateStay } from "./services/rules";
import { rateLimit } from "./staff";
import { storage } from "./lib/storage";
import { MOTEL } from "@contracts/business";
import { queueEmail, requestEmail } from "./services/email";

const stayInput = z.object({
  checkIn: z.string(), checkOut: z.string(),
  adults: z.number().int().min(1).max(10), children: z.number().int().min(0).max(10), infants: z.number().int().min(0).max(20),
  preferredCheckInTime: z.string().default("2:00 PM"),
});

async function publicUrl(key?: string | null) {
  if (!key) return null;
  try { return (await storage.getPresignedUrl({ key })).url; } catch { return null; }
}

async function roomTypeOutput() {
  const db = getDb();
  const types = await db.select().from(roomTypes).where(eq(roomTypes.active, true)).orderBy(asc(roomTypes.sortOrder));
  return Promise.all(types.map(async (type) => {
    const photos = await db.select({ media, sortOrder: roomTypeMedia.sortOrder, isCover: roomTypeMedia.isCover })
      .from(roomTypeMedia).innerJoin(media, eq(roomTypeMedia.mediaId, media.id))
      .where(and(eq(roomTypeMedia.roomTypeId, type.id), eq(media.isPublic, true)))
      .orderBy(desc(roomTypeMedia.isCover), asc(roomTypeMedia.sortOrder));
    const gallery = await Promise.all(photos.map(async (photo) => ({
      id: photo.media.id, alt: photo.media.altText || `${type.name} at ${MOTEL.name}`,
      caption: photo.media.caption, url: await publicUrl(photo.media.variants?.large || photo.media.storageKey),
      thumbnail: await publicUrl(photo.media.variants?.medium || photo.media.storageKey),
    })));
    return { ...type, gallery: gallery.filter((p) => p.url), placeholder: `/placeholders/${type.slug}.svg` };
  }));
}

export const publicRouter = createRouter({
  bootstrap: publicQuery.query(async () => {
    const db = getDb();
    const [types, settings, heroRows, galleryRows] = await Promise.all([
      roomTypeOutput(), db.select().from(siteSettings),
      db.select({ media }).from(siteMedia).innerJoin(media, eq(siteMedia.mediaId, media.id)).where(and(eq(siteMedia.slot, "HERO"), eq(siteMedia.active, true), eq(media.isPublic, true))).limit(1),
      db.select({ media }).from(siteMedia).innerJoin(media, eq(siteMedia.mediaId, media.id)).where(and(eq(siteMedia.slot, "GALLERY"), eq(siteMedia.active, true), eq(media.isPublic, true))).orderBy(asc(siteMedia.sortOrder)).limit(8),
    ]);
    const safeKeys = ["public_from_rate", "standard_check_in", "earliest_early_check_in", "check_out", "front_desk_hours", "hero_text", "pet_copy", "late_arrival_copy", "ga4_enabled", "ga4_measurement_id"];
    const config = Object.fromEntries(settings.filter((s) => safeKeys.includes(s.key)).map((s) => [s.key, s.value]));
    return {
      motel: MOTEL, roomTypes: types, settings: config, today: motelToday(),
      hero: heroRows[0] ? { url: await publicUrl(heroRows[0].media.variants?.large || heroRows[0].media.storageKey), alt: heroRows[0].media.altText } : null,
      gallery: await Promise.all(galleryRows.map(async (row) => ({ id: row.media.id, url: await publicUrl(row.media.variants?.medium || row.media.storageKey), alt: row.media.altText, caption: row.media.caption }))),
    };
  }),

  availability: publicQuery.input(stayInput.extend({
    roomTypeId: z.number().int().optional(),
    kitchenPreference: z.enum(["NO_PREFERENCE", "PREFER", "REQUIRED"]).default("NO_PREFERENCE"),
  })).query(async ({ input }) => {
    const errors = validateStay(input);
    if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors[0] });
    const db = getDb();
    const types = await db.select().from(roomTypes).where(and(eq(roomTypes.active, true), input.roomTypeId ? eq(roomTypes.id, input.roomTypeId) : undefined));
    const typePhotos = await roomTypeOutput();
    const results = [];
    for (const type of types) {
      if (input.adults + input.children > type.maxOccupancy) {
        results.push({ roomType: type, photo: typePhotos.find((item) => item.id === type.id)?.gallery[0]?.url || `/placeholders/${type.slug}.svg`, level: "UNAVAILABLE" as const, reason: `Maximum ${type.maxOccupancy} guests, excluding infants under 2.`, quote: null });
        continue;
      }
      const rooms = await availability({ ...input, roomTypeId: type.id });
      const quote = rooms.length ? await cheapestQuote(input.checkIn, input.checkOut, rooms) : null;
      results.push({
        roomType: type, photo: typePhotos.find((item) => item.id === type.id)?.gallery[0]?.url || `/placeholders/${type.slug}.svg`, level: rooms.length === 0 ? "UNAVAILABLE" as const : rooms.length <= 2 ? "LIMITED" as const : "AVAILABLE" as const,
        reason: rooms.length ? "Available to request; not held until confirmed by the motel." : "No matching rooms for these dates. Try different dates or call the front desk.", quote,
      });
    }
    return { results, notice: "Availability shows that a request can be submitted. It does not reserve a room." };
  }),

  submitRequest: publicQuery.input(stayInput.extend({
    roomTypeId: z.number().int(), kitchenPreference: z.enum(["NO_PREFERENCE", "PREFER", "REQUIRED"]),
    pets: z.boolean(), estimatedArrivalTime: z.string().max(20).optional(),
    firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(7).max(50), email: z.string().trim().email().max(320),
    vehicleType: z.enum(["Car", "SUV", "Pickup", "Other"]).optional(), specialRequests: z.string().max(3000).optional(),
    idempotencyKey: z.string().uuid(), website: z.string().max(0).optional().or(z.literal("")),
  })).mutation(async ({ ctx, input }) => {
    rateLimit(`request:${ctx.req.headers.get("x-forwarded-for") || "local"}`, 8, 60 * 60 * 1000);
    const errors = validateStay(input);
    if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors[0] });
    if (timeToMinutes(input.preferredCheckInTime) < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Please enter a valid preferred check-in time." });
    const db = getDb();
    if (input.idempotencyKey) {
      const [existing] = await db.select().from(reservations).where(eq(reservations.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) return { requestNumber: existing.requestNumber, status: existing.status, duplicate: true };
    }
    const [type] = await db.select().from(roomTypes).where(and(eq(roomTypes.id, input.roomTypeId), eq(roomTypes.active, true))).limit(1);
    if (!type) throw new TRPCError({ code: "NOT_FOUND", message: "Please choose a valid room type." });
    if (input.adults + input.children > type.maxOccupancy) throw new TRPCError({ code: "BAD_REQUEST", message: `This room type allows up to ${type.maxOccupancy} guests, excluding infants under 2.` });
    const availableRooms = await availability(input);
    if (!availableRooms.length) throw new TRPCError({ code: "CONFLICT", message: "Availability changed while you were completing the form. No room has been held. Please try other dates or contact the front desk." });
    const quote = await cheapestQuote(input.checkIn, input.checkOut, availableRooms);
    const early = timeToMinutes(input.preferredCheckInTime) < 14 * 60;
    const dateCode = motelToday().replaceAll("-", "");
    let requestNumber = "";
    let reservationId = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      requestNumber = `RV-${dateCode}-${randomUUID().slice(0, 6).toUpperCase()}`;
      try {
        const inserted = await db.insert(reservations).values({
          requestNumber, idempotencyKey: input.idempotencyKey, checkIn: input.checkIn, checkOut: input.checkOut,
          preferredCheckInTime: input.preferredCheckInTime, estimatedArrivalTime: input.estimatedArrivalTime,
          adults: input.adults, children: input.children, infants: input.infants, pets: input.pets,
          roomTypeId: input.roomTypeId, kitchenPreference: input.kitchenPreference,
          earlyCheckInStatus: early ? "REQUESTED" : "NOT_REQUESTED",
          firstName: input.firstName, lastName: input.lastName, phone: input.phone, email: input.email.toLowerCase(),
          vehicleType: input.vehicleType, specialRequests: input.specialRequests,
          estimatedSubtotal: quote?.subtotal || "0", estimatedTaxes: quote?.taxes || "0", estimatedTotal: quote?.total || "0",
        }).$returningId();
        reservationId = inserted[0].id;
        break;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    await db.insert(reservationGuests).values({ reservationId, firstName: input.firstName, lastName: input.lastName, isPrimary: true });
    try {
      await queueEmail({ reservationId, recipient: input.email, emailType: "REQUEST_RECEIVED", subject: `Reservation Request Received — ${requestNumber}`, body: requestEmail(requestNumber, `${input.firstName} ${input.lastName}`, input.checkIn, input.checkOut, type.name, input.preferredCheckInTime, input.adults + input.children), deduplicate: true });
      await queueEmail({ reservationId, recipient: MOTEL.email, emailType: "FRONT_DESK_NOTIFICATION", subject: `New Reservation Request — ${requestNumber}`, body: `${requestEmail(requestNumber, `${input.firstName} ${input.lastName}`, input.checkIn, input.checkOut, type.name, input.preferredCheckInTime, input.adults + input.children)}\n\nGuest phone: ${input.phone}\nKitchen preference: ${input.kitchenPreference}\nPets: ${input.pets ? "Yes" : "No"}\nSpecial requests: ${input.specialRequests || "None"}`, deduplicate: true });
    } catch { /* Email failure never cancels a request. */ }
    return { requestNumber, status: "REQUESTED" as const, duplicate: false };
  }),
});
