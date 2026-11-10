import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { roomTypes, rooms, siteSettings, staffUsers, taxRules } from "./schema";
import { DEFAULT_SETTINGS, MOTEL } from "../contracts/business";

const typeSeed = [
  { slug: "queen", name: "Queen Room", bedDescription: "1 Queen Bed", maxOccupancy: 2, kitchenCopy: "Kitchen available in select rooms", description: "A practical ground-floor room for one or two guests, with free Wi-Fi and easy parking outside.", sortOrder: 1 },
  { slug: "double", name: "Double Room", bedDescription: "1 Double Bed", maxOccupancy: 2, kitchenCopy: "No kitchen", description: "A simple, comfortable room for a road-trip stop or a short stay in Merritt.", sortOrder: 2 },
  { slug: "two-double", name: "Two Double Beds", bedDescription: "2 Double Beds", maxOccupancy: 4, kitchenCopy: "Kitchen available in select rooms", description: "Extra sleeping space for families, friends and work crews.", sortOrder: 3 },
  { slug: "two-queen", name: "Two Queen Beds", bedDescription: "2 Queen Beds", maxOccupancy: 4, kitchenCopy: "Kitchen included", description: "Two queen beds and a kitchen for a convenient longer stay.", sortOrder: 4 },
  { slug: "family", name: "Three-Bed Room / Family Room", bedDescription: "2 Double Beds + 1 Queen Bed", maxOccupancy: 5, kitchenCopy: "Kitchen included", description: "Our largest room, with three beds and space for up to five guests.", sortOrder: 5 },
];

const roomSeed = [
  [1, "queen", "1 Queen", true, 2, 2], [2, "queen", "1 Queen", true, 2, 1],
  [3, "family", "2 Double + 1 Queen", true, 5, null], [4, "queen", "1 Queen", false, 2, null],
  [5, "queen", "1 Queen", true, 2, null], [6, "queen", "1 Queen", true, 2, null],
  [7, "queen", "1 Queen", true, 2, null], [8, "two-queen", "2 Queen", true, 4, null],
  [9, "two-double", "2 Double", true, 4, null], [10, "queen", "1 Queen", false, 2, null],
  [11, "queen", "1 Queen", true, 2, null], [12, "queen", "1 Queen", true, 2, null],
  [13, "double", "Basement", false, 0, null], [14, "queen", "1 Queen", true, 2, null],
  [15, "two-double", "2 Double", false, 4, null], [16, "two-double", "2 Double", false, 4, null],
  [17, "queen", "1 Queen", true, 2, null], [18, "double", "1 Double", false, 2, null],
] as const;

async function seed() {
  const db = getDb();
  console.log("Seeding Ranchland Villa Motel...");
  const typeIds = new Map<string, number>();
  for (const item of typeSeed) {
    const [existing] = await db.select().from(roomTypes).where(eq(roomTypes.slug, item.slug)).limit(1);
    if (existing) typeIds.set(item.slug, existing.id);
    else {
      const [{ id }] = await db.insert(roomTypes).values(item).$returningId();
      typeIds.set(item.slug, id);
    }
  }
  for (const [number, slug, beds, kitchen, occupancy, connecting] of roomSeed) {
    const [existing] = await db.select().from(rooms).where(eq(rooms.roomNumber, number)).limit(1);
    if (existing) continue;
    await db.insert(rooms).values({
      roomNumber: number, roomTypeId: typeIds.get(slug)!, bedConfig: beds, kitchen,
      maxOccupancy: occupancy, connectingRoom: connecting, defaultRate: "119.00",
      public: number !== 13, active: true, status: number === 13 ? "INTERNAL" : "AVAILABLE",
      notes: number === 13 ? "Basement. Internal use only; never available publicly." : null,
    });
  }
  const settings: Record<string, unknown> = {
    ...DEFAULT_SETTINGS, motel_name: MOTEL.name, address: MOTEL.address, phone: MOTEL.phone,
    text: MOTEL.text, email: MOTEL.email,
  };
  for (const [key, value] of Object.entries(settings)) {
    const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
    if (!existing) await db.insert(siteSettings).values({ key, value });
  }
  for (const name of ["GST", "Accommodation PST", "MRDT"]) {
    const [existing] = await db.select().from(taxRules).where(eq(taxRules.name, name)).limit(1);
    if (!existing) await db.insert(taxRules).values({ name, enabled: false, rate: "0", effectiveDate: "2026-01-01" });
  }
  const users = [
    { name: "Motel Administrator", email: "admin@ranchlandvilla.ca", role: "ADMIN" as const, password: process.env.ADMIN_INITIAL_PASSWORD || "Ranchland!2026" },
    { name: "Front Desk", email: "frontdesk@ranchlandvilla.ca", role: "FRONT_DESK" as const, password: process.env.FRONTDESK_INITIAL_PASSWORD || "FrontDesk!2026" },
  ];
  for (const user of users) {
    const [existing] = await db.select().from(staffUsers).where(eq(staffUsers.email, user.email)).limit(1);
    if (!existing) await db.insert(staffUsers).values({ name: user.name, email: user.email, role: user.role, passwordHash: await bcrypt.hash(user.password, 12) });
  }
  console.log("Seed complete: 18 rooms (17 public), 5 room types, disabled tax rules, site settings and staff accounts.");
  process.exit(0);
}

seed().catch((error) => { console.error(error); process.exit(1); });
