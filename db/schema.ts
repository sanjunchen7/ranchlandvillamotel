import {
  mysqlTable, mysqlEnum, serial, varchar, text, timestamp, bigint,
  boolean, int, decimal, date, json, index, uniqueIndex,
} from "drizzle-orm/mysql-core";

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
};
const fk = (name: string) => bigint(name, { mode: "number", unsigned: true }).notNull();

export const staffUsers = mysqlTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["ADMIN", "FRONT_DESK"]).notNull().default("FRONT_DESK"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const staffSessions = mysqlTable("staff_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  staffId: fk("staff_id").references(() => staffUsers.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roomTypes = mysqlTable("room_types", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  bedDescription: varchar("bed_description", { length: 180 }).notNull(),
  description: text("description").notNull(),
  kitchenCopy: varchar("kitchen_copy", { length: 255 }).notNull(),
  maxOccupancy: int("max_occupancy").notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const rooms = mysqlTable("rooms", {
  id: serial("id").primaryKey(),
  roomNumber: int("room_number").notNull().unique(),
  roomTypeId: fk("room_type_id").references(() => roomTypes.id),
  bedConfig: varchar("bed_config", { length: 180 }).notNull(),
  kitchen: boolean("kitchen").notNull().default(false),
  maxOccupancy: int("max_occupancy").notNull(),
  public: boolean("public").notNull().default(true),
  active: boolean("active").notNull().default(true),
  status: mysqlEnum("status", ["AVAILABLE", "MAINTENANCE", "INTERNAL"]).notNull().default("AVAILABLE"),
  connectingRoom: int("connecting_room"),
  notes: text("notes"),
  defaultRate: decimal("default_rate", { precision: 9, scale: 2 }).notNull().default("119.00"),
  ...timestamps,
}, (t) => ({ typeIdx: index("rooms_type_idx").on(t.roomTypeId) }));

export const media = mysqlTable("media", {
  id: serial("id").primaryKey(),
  storageKey: varchar("storage_key", { length: 512 }).notNull().unique(),
  variants: json("variants").$type<Record<string, string>>(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  size: int("size").notNull(),
  altText: varchar("alt_text", { length: 500 }).notNull().default(""),
  caption: varchar("caption", { length: 500 }).notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const roomMedia = mysqlTable("room_media", {
  id: serial("id").primaryKey(),
  roomId: fk("room_id").references(() => rooms.id),
  mediaId: fk("media_id").references(() => media.id),
  sortOrder: int("sort_order").notNull().default(0),
  isCover: boolean("is_cover").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),
}, (t) => ({ roomMediaUnique: uniqueIndex("room_media_unique").on(t.roomId, t.mediaId) }));

export const roomTypeMedia = mysqlTable("room_type_media", {
  id: serial("id").primaryKey(),
  roomTypeId: fk("room_type_id").references(() => roomTypes.id),
  mediaId: fk("media_id").references(() => media.id),
  sortOrder: int("sort_order").notNull().default(0),
  isCover: boolean("is_cover").notNull().default(false),
}, (t) => ({ typeMediaUnique: uniqueIndex("type_media_unique").on(t.roomTypeId, t.mediaId) }));

export const siteMedia = mysqlTable("site_media", {
  id: serial("id").primaryKey(),
  mediaId: fk("media_id").references(() => media.id),
  slot: mysqlEnum("slot", ["HERO", "GALLERY", "EXTERIOR", "PARKING", "CONTACT"]).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const roomDailyRates = mysqlTable("room_daily_rates", {
  id: serial("id").primaryKey(),
  roomId: fk("room_id").references(() => rooms.id),
  rateDate: date("rate_date", { mode: "string" }).notNull(),
  rate: decimal("rate", { precision: 9, scale: 2 }).notNull(),
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  ...timestamps,
}, (t) => ({ roomDateUnique: uniqueIndex("room_rate_date_unique").on(t.roomId, t.rateDate) }));

export const taxRules = mysqlTable("tax_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  rate: decimal("rate", { precision: 7, scale: 4 }).notNull().default("0"),
  effectiveDate: date("effective_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  appliesToFees: boolean("applies_to_fees").notNull().default(false),
  ...timestamps,
});

export const reservations = mysqlTable("reservations", {
  id: serial("id").primaryKey(),
  requestNumber: varchar("request_number", { length: 40 }).notNull().unique(),
  idempotencyKey: varchar("idempotency_key", { length: 80 }).unique(),
  status: mysqlEnum("status", ["REQUESTED", "REVIEWING", "AWAITING_GUARANTEE", "CARD_GUARANTEED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "DECLINED", "CANCELLED", "NO_SHOW"]).notNull().default("REQUESTED"),
  checkIn: date("check_in", { mode: "string" }).notNull(),
  checkOut: date("check_out", { mode: "string" }).notNull(),
  preferredCheckInTime: varchar("preferred_check_in_time", { length: 20 }).notNull().default("2:00 PM"),
  estimatedArrivalTime: varchar("estimated_arrival_time", { length: 20 }),
  confirmedCheckInTime: varchar("confirmed_check_in_time", { length: 20 }),
  adults: int("adults").notNull(),
  children: int("children").notNull().default(0),
  infants: int("infants").notNull().default(0),
  pets: boolean("pets").notNull().default(false),
  petCount: int("pet_count"),
  petNotes: text("pet_notes"),
  petFee: decimal("pet_fee", { precision: 9, scale: 2 }),
  roomTypeId: fk("room_type_id").references(() => roomTypes.id),
  assignedRoomId: bigint("assigned_room_id", { mode: "number", unsigned: true }).references(() => rooms.id),
  kitchenPreference: mysqlEnum("kitchen_preference", ["NO_PREFERENCE", "PREFER", "REQUIRED"]).notNull().default("NO_PREFERENCE"),
  earlyCheckInStatus: mysqlEnum("early_check_in_status", ["NOT_REQUESTED", "REQUESTED", "APPROVED", "NOT_APPROVED"]).notNull().default("NOT_REQUESTED"),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 40 }),
  specialRequests: text("special_requests"),
  internalNotes: text("internal_notes"),
  estimatedSubtotal: decimal("estimated_subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedTaxes: decimal("estimated_taxes", { precision: 10, scale: 2 }).notNull().default("0"),
  estimatedTotal: decimal("estimated_total", { precision: 10, scale: 2 }).notNull().default("0"),
  priceSnapshotVersion: int("price_snapshot_version").notNull().default(0),
  noShowChargeStatus: mysqlEnum("no_show_charge_status", ["PENDING", "CHARGED", "WAIVED", "FAILED"]),
  noShowChargedAmount: decimal("no_show_charged_amount", { precision: 10, scale: 2 }),
  confirmedAt: timestamp("confirmed_at"),
  checkedInAt: timestamp("checked_in_at"),
  checkedOutAt: timestamp("checked_out_at"),
  ...timestamps,
}, (t) => ({
  datesIdx: index("reservation_dates_idx").on(t.assignedRoomId, t.checkIn, t.checkOut),
  statusIdx: index("reservation_status_idx").on(t.status),
}));

export const reservationGuests = mysqlTable("reservation_guests", {
  id: serial("id").primaryKey(),
  reservationId: fk("reservation_id").references(() => reservations.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(true),
});

export const roomHolds = mysqlTable("room_holds", {
  id: serial("id").primaryKey(),
  reservationId: bigint("reservation_id", { mode: "number", unsigned: true }).references(() => reservations.id),
  roomId: fk("room_id").references(() => rooms.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  releasedAt: timestamp("released_at"),
  releaseReason: varchar("release_reason", { length: 255 }),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ holdDatesIdx: index("hold_dates_idx").on(t.roomId, t.startDate, t.endDate) }));

export const maintenanceBlocks = mysqlTable("maintenance_blocks", {
  id: serial("id").primaryKey(),
  roomId: fk("room_id").references(() => rooms.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  releasedAt: timestamp("released_at"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reservationPriceItems = mysqlTable("reservation_price_items", {
  id: serial("id").primaryKey(),
  reservationId: fk("reservation_id").references(() => reservations.id),
  version: int("version").notNull(),
  itemType: mysqlEnum("item_type", ["NIGHT", "TAX", "FEE"]).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  itemDate: date("item_date", { mode: "string" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  supersededBy: int("superseded_by"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ versionIdx: index("price_version_idx").on(t.reservationId, t.version, t.active) }));

export const reservationGuarantees = mysqlTable("reservation_guarantees", {
  id: serial("id").primaryKey(),
  reservationId: fk("reservation_id").references(() => reservations.id),
  status: mysqlEnum("status", ["PENDING", "VERIFIED", "PREAUTHORIZED", "OVERRIDE", "NO_GUARANTEE", "FAILED"]).notNull(),
  method: mysqlEnum("method", ["CARD_VERIFIED", "PREAUTHORIZED", "FRONT_DESK_OVERRIDE", "NO_GUARANTEE"]).notNull(),
  cardBrand: varchar("card_brand", { length: 30 }),
  cardLast4: varchar("card_last4", { length: 4 }),
  guaranteeAmount: decimal("guarantee_amount", { precision: 10, scale: 2 }),
  verificationDate: timestamp("verification_date"),
  verifiedBy: bigint("verified_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  providerReference: varchar("provider_reference", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reservationStatusHistory = mysqlTable("reservation_status_history", {
  id: serial("id").primaryKey(),
  reservationId: fk("reservation_id").references(() => reservations.id),
  fromStatus: varchar("from_status", { length: 40 }),
  toStatus: varchar("to_status", { length: 40 }).notNull(),
  reason: text("reason"),
  changedBy: bigint("changed_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorStaffId: bigint("actor_staff_id", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 80 }),
  details: json("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ auditTimeIdx: index("audit_time_idx").on(t.createdAt) }));

export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: json("value").$type<unknown>().notNull(),
  updatedBy: bigint("updated_by", { mode: "number", unsigned: true }).references(() => staffUsers.id),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const emailLogs = mysqlTable("email_logs", {
  id: serial("id").primaryKey(),
  reservationId: bigint("reservation_id", { mode: "number", unsigned: true }).references(() => reservations.id),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  emailType: mysqlEnum("email_type", ["REQUEST_RECEIVED", "CONFIRMATION", "UPDATED_CONFIRMATION", "FRONT_DESK_NOTIFICATION"]).notNull(),
  snapshotVersion: int("snapshot_version").notNull().default(0),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["QUEUED", "SENT", "FAILED"]).notNull().default("QUEUED"),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ emailDedupIdx: index("email_dedup_idx").on(t.reservationId, t.emailType, t.snapshotVersion, t.status) }));

export const roomNightInventory = mysqlTable("room_night_inventory", {
  id: serial("id").primaryKey(),
  roomId: fk("room_id").references(() => rooms.id),
  stayDate: date("stay_date", { mode: "string" }).notNull(),
  sourceType: mysqlEnum("source_type", ["RESERVATION", "HOLD", "MAINTENANCE"]).notNull(),
  sourceId: int("source_id").notNull(),
  reservationId: bigint("reservation_id", { mode: "number", unsigned: true }).references(() => reservations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  roomNightUnique: uniqueIndex("room_night_unique").on(t.roomId, t.stayDate),
  sourceIdx: index("inventory_source_idx").on(t.sourceType, t.sourceId),
  reservationIdx: index("inventory_reservation_idx").on(t.reservationId),
}));
