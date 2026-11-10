import { z } from "zod";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";
import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { audit, staffQuery } from "./staff";
import { getDb } from "./queries/connection";
import { media, roomMedia, roomTypeMedia, siteMedia } from "@db/schema";
import { storage } from "./lib/storage";

async function url(key?: string | null) {
  if (!key) return null;
  try { return (await storage.getPresignedUrl({ key })).url; } catch { return null; }
}

export const mediaRouter = createRouter({
  list: staffQuery.query(async () => {
    const db = getDb();
    const [rows, roomLinks, typeLinks, siteLinks] = await Promise.all([
      db.select().from(media).orderBy(desc(media.createdAt)).limit(300),
      db.select().from(roomMedia), db.select().from(roomTypeMedia), db.select().from(siteMedia),
    ]);
    return Promise.all(rows.map(async (item) => ({
      ...item, url: await url(item.variants?.medium || item.storageKey),
      roomLinks: roomLinks.filter((link) => link.mediaId === item.id),
      typeLinks: typeLinks.filter((link) => link.mediaId === item.id),
      siteLinks: siteLinks.filter((link) => link.mediaId === item.id),
    })));
  }),

  upload: staffQuery.input(z.object({
    name: z.string().min(1).max(180), contentBase64: z.string().min(20),
    altText: z.string().max(500).default(""), caption: z.string().max(500).default(""), isPublic: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    if (input.contentBase64.length > 14_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Please choose an image smaller than 10 MB." });
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Please choose an image smaller than 10 MB." });
    let image: Sharp;
    let metadata: Metadata;
    try { image = sharp(bytes, { failOn: "error" }); metadata = await image.metadata(); }
    catch { throw new TRPCError({ code: "BAD_REQUEST", message: "The file is not a valid image." }); }
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || !metadata.width || !metadata.height) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only valid JPEG, PNG and WebP images are supported." });
    }
    const base = `media/${randomUUID()}`;
    const ext = metadata.format === "jpeg" ? "jpg" : metadata.format;
    const uploadedKeys: string[] = [];
    try {
      const original = await storage.uploadFile({ fileContent: bytes, fileName: `${base}/original.${ext}`, contentType: `image/${metadata.format}` });
      uploadedKeys.push(original.key);
      const variants: Record<string, string> = {};
      for (const [name, width] of [["thumbnail", 320], ["medium", 960], ["large", 1800]] as const) {
        const output = await image.clone().rotate().resize({ width, withoutEnlargement: true }).webp({ quality: name === "large" ? 86 : 80 }).toBuffer();
        const saved = await storage.uploadFile({ fileContent: output, fileName: `${base}/${name}.webp`, contentType: "image/webp" });
        uploadedKeys.push(saved.key); variants[name] = saved.key;
      }
      const [{ id }] = await getDb().insert(media).values({
        storageKey: original.key, variants, originalFilename: input.name.replace(/[\\/]/g, "-"), mimeType: `image/${metadata.format}`,
        width: metadata.width, height: metadata.height, size: bytes.length, altText: input.altText,
        caption: input.caption, isPublic: input.isPublic, createdBy: ctx.staff.id,
      }).$returningId();
      await audit(ctx.staff.id, "MEDIA_UPLOADED", "media", id, { filename: input.name, width: metadata.width, height: metadata.height, isPublic: input.isPublic });
      return { id, ok: true };
    } catch (error) {
      if (uploadedKeys.length) await storage.deleteFiles({ fileKeys: uploadedKeys }).catch(() => undefined);
      throw error;
    }
  }),

  update: staffQuery.input(z.object({ id: z.number().int().positive(), altText: z.string().max(500), caption: z.string().max(500), isPublic: z.boolean() })).mutation(async ({ ctx, input }) => {
    await getDb().update(media).set({ altText: input.altText, caption: input.caption, isPublic: input.isPublic }).where(eq(media.id, input.id));
    await audit(ctx.staff.id, "MEDIA_UPDATED", "media", input.id, { isPublic: input.isPublic });
    return { ok: true };
  }),

  assign: staffQuery.input(z.object({
    mediaId: z.number().int().positive(), target: z.enum(["ROOM", "ROOM_TYPE", "SITE"]),
    targetId: z.number().int().positive().optional(), slot: z.enum(["HERO", "GALLERY", "EXTERIOR", "PARKING", "CONTACT"]).optional(),
    isPublic: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const [item] = await getDb().select().from(media).where(eq(media.id, input.mediaId)).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Image not found." });
    const db = getDb();
    if (input.target === "ROOM" && input.targetId) await db.insert(roomMedia).values({ roomId: input.targetId, mediaId: input.mediaId, isPublic: input.isPublic }).onDuplicateKeyUpdate({ set: { isPublic: input.isPublic } });
    else if (input.target === "ROOM_TYPE" && input.targetId) await db.insert(roomTypeMedia).values({ roomTypeId: input.targetId, mediaId: input.mediaId }).onDuplicateKeyUpdate({ set: { mediaId: input.mediaId } });
    else if (input.target === "SITE" && input.slot) await db.insert(siteMedia).values({ mediaId: input.mediaId, slot: input.slot });
    else throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a valid image destination." });
    // Assigning an internal room image to a room type never changes media.isPublic.
    await audit(ctx.staff.id, "MEDIA_ASSIGNED", "media", input.mediaId, { target: input.target, targetId: input.targetId, slot: input.slot });
    return { ok: true };
  }),

  setCover: staffQuery.input(z.object({ id: z.number().int().positive(), target: z.enum(["ROOM", "ROOM_TYPE"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    if (input.target === "ROOM") {
      const [link] = await db.select().from(roomMedia).where(eq(roomMedia.id, input.id)).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(roomMedia).set({ isCover: false }).where(eq(roomMedia.roomId, link.roomId));
      await db.update(roomMedia).set({ isCover: true }).where(eq(roomMedia.id, input.id));
    } else {
      const [link] = await db.select().from(roomTypeMedia).where(eq(roomTypeMedia.id, input.id)).limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(roomTypeMedia).set({ isCover: false }).where(eq(roomTypeMedia.roomTypeId, link.roomTypeId));
      await db.update(roomTypeMedia).set({ isCover: true }).where(eq(roomTypeMedia.id, input.id));
    }
    await audit(ctx.staff.id, "MEDIA_COVER_SET", "media_link", input.id, { target: input.target });
    return { ok: true };
  }),

  reorder: staffQuery.input(z.object({ id: z.number().int().positive(), target: z.enum(["ROOM", "ROOM_TYPE"]), direction: z.enum(["UP", "DOWN"]) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const table = input.target === "ROOM" ? roomMedia : roomTypeMedia;
    const [link] = await db.select().from(table).where(eq(table.id, input.id)).limit(1);
    if (!link) throw new TRPCError({ code: "NOT_FOUND" });
    const parentId = "roomId" in link ? link.roomId : link.roomTypeId;
    const parentColumn = input.target === "ROOM" ? roomMedia.roomId : roomTypeMedia.roomTypeId;
    const siblings = await db.select().from(table).where(eq(parentColumn, parentId)).orderBy(asc(table.sortOrder), asc(table.id));
    const index = siblings.findIndex((item) => item.id === link.id);
    const otherIndex = input.direction === "UP" ? index - 1 : index + 1;
    if (index < 0 || !siblings[otherIndex]) return { ok: true };
    const other = siblings[otherIndex];
    await db.update(table).set({ sortOrder: other.sortOrder }).where(eq(table.id, link.id));
    await db.update(table).set({ sortOrder: link.sortOrder }).where(eq(table.id, other.id));
    if (link.sortOrder === other.sortOrder) {
      await db.update(table).set({ sortOrder: otherIndex }).where(eq(table.id, link.id));
      await db.update(table).set({ sortOrder: index }).where(eq(table.id, other.id));
    }
    await audit(ctx.staff.id, "MEDIA_REORDERED", "media_link", input.id, { target: input.target, direction: input.direction });
    return { ok: true };
  }),

  remove: staffQuery.input(z.object({ id: z.number().int().positive(), force: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const [item] = await db.select().from(media).where(eq(media.id, input.id)).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    const [roomRefs, typeRefs, siteRefs] = await Promise.all([
      db.select().from(roomMedia).where(eq(roomMedia.mediaId, input.id)), db.select().from(roomTypeMedia).where(eq(roomTypeMedia.mediaId, input.id)), db.select().from(siteMedia).where(eq(siteMedia.mediaId, input.id)),
    ]);
    const references = roomRefs.length + typeRefs.length + siteRefs.length;
    if (references && !input.force) throw new TRPCError({ code: "CONFLICT", message: `This image is used in ${roomRefs.length} room(s), ${typeRefs.length} room type(s) and ${siteRefs.length} site area(s). Confirm deletion to remove those placements.` });
    await storage.deleteFiles({ fileKeys: [item.storageKey, ...Object.values(item.variants || {})] });
    await db.delete(roomMedia).where(eq(roomMedia.mediaId, input.id));
    await db.delete(roomTypeMedia).where(eq(roomTypeMedia.mediaId, input.id));
    await db.delete(siteMedia).where(eq(siteMedia.mediaId, input.id));
    await db.delete(media).where(eq(media.id, input.id));
    await audit(ctx.staff.id, "MEDIA_DELETED", "media", input.id, { references });
    return { ok: true };
  }),
});
