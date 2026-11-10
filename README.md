# Ranchland Villa Motel

A full-stack public motel website and reservation management system for Ranchland Villa Motel, 2379 Nicola Ave, Merritt, BC.

## What is included

- Mobile-first public site: Home, Rooms, Availability / Reservation Request, Contact and FAQ.
- Five public room types and 17 public rooms; Room 13 is always internal.
- Server-validated dates, guest counts, kitchen requirements, pets and early check-in requests.
- Reservation workflow: REQUESTED → REVIEWING → AWAITING_GUARANTEE → CARD_GUARANTEED → CONFIRMED → CHECKED_IN → CHECKED_OUT.
- Timed room holds, maintenance blocks, per-night rates, a 14-day room availability calendar and versioned price snapshots.
- Database-level `UNIQUE(room_id, stay_date)` inventory protection against concurrent overbooking.
- Staff authentication, ADMIN / FRONT_DESK permissions, guarantee records and admin override audit.
- No-show first-night charge recording without storing full card data or charging automatically.
- Media library with JPEG / PNG / WebP validation, object storage and generated thumbnail / medium / large WebP variants.
- Email outbox with delivery status, deduplication and retry; optional GA4; SEO metadata, sitemap and robots.txt.
- Installable PWA with network-only page navigation.

## Run locally

```bash
npm install
cp .env.example .env
# Fill DATABASE_URL and initial staff passwords in .env
npm run db:migrate
npm run db:seed
npm run dev
```

The application runs at `http://localhost:3000`.

Production:

```bash
npm run check
npm run test
npm run build
npm start
```

The build also vendors the required Linux x64 image-processing runtime into `dist/`, so the production bundle has been verified without a root `node_modules` directory. Use the included Debian-based Dockerfile for a matching runtime.

## Initial preview accounts

If the seed script is run without overriding the initial password variables:

- ADMIN: `admin@ranchlandvilla.ca` / `Ranchland!2026`
- FRONT_DESK: `frontdesk@ranchlandvilla.ca` / `FrontDesk!2026`

**Change these passwords in Settings before any real deployment.** Better: set `ADMIN_INITIAL_PASSWORD` and `FRONTDESK_INITIAL_PASSWORD` to strong values before the first seed. Existing accounts are not overwritten by later seeds.

## Required configuration before real use

1. Upload actual motel and room photos in Media Library. Included illustrations are explicitly labelled placeholders and are not presented as real photographs.
2. Set the real GST / Accommodation PST / MRDT rules. Seeded tax rules are disabled with a zero rate, so the site does not invent tax amounts.
3. Update the manually maintained public From Price between seasons. All seed room default rates start at CA$119 and should be reviewed.
4. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`. Without SMTP, messages remain QUEUED with a clear “not sent” explanation; reservation status changes still succeed.
5. Review staff access, room occupancy and daily rates.

## Database

`db/migrations/` contains the full initial migration. `npm run db:seed` is idempotent and preserves existing room rates, settings and staff passwords.

The `room_night_inventory` table stores one row per occupied room night. Confirmed stays, active holds and maintenance all write through the same inventory service. The unique constraint is the final atomic guard if two staff members confirm the same room at the same time.

## Security notes

- Never enter a full card number, CVV or CVC in any field. Only brand, last four digits and a provider reference are supported.
- Staff sessions use random, database-hashed tokens. First-party sessions use HttpOnly cookies; embedded previews can use a short-lived bearer fallback stored only in sessionStorage. No reservation or card data is stored in browser storage.
- Mutations are origin-checked; login and public requests are rate-limited; public requests include a honeypot.
- Uploads are authenticated and validated by decoding the real image, not by trusting the filename extension.

## Verification

`npm run test` covers half-open date overlap, same-day checkout / arrival, guest validation, uncapped infants, motel-timezone dates, early check-in limits, legal state transitions, money rounding and card-last-four validation.

The delivered build was also exercised in a real browser through request submission, review, room assignment, early check-in approval, timed hold, guarantee, confirmation, check-in and check-out. Concurrent confirmation was tested separately: one request succeeds and the other receives HTTP 409 without creating an extra inventory row. Object storage upload, independent reads, browser preview and deletion were also exercised.

## Assets and licenses

Inter and Space Grotesk are bundled through Fontsource under the SIL Open Font License. Lucide icons are ISC-licensed. Placeholder illustrations and the application icon were created for this project; they are explicitly marked as non-photographic placeholders.

Cloud database, object storage and published-site runtime consume the site owner’s platform quota.
