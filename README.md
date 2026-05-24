# Allo Inventory

A Next.js inventory and reservation platform for multi-warehouse retail. Customers can browse products, reserve stock, and confirm or cancel their purchase — all with race-condition-safe concurrency guarantees.

---

## Live Demo

> _Deploy to Vercel 

---

## Running Locally

### 1. Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase / Neon / Railway — free tier is fine)
- Redis instance (Upstash — free tier is fine, or local `redis-server`)

### 2. Clone and install

```bash
git clone <repo>
cd allo-inventory
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="postgresql://..."   # Supabase / Neon connection string
REDIS_URL="redis://..."           # Upstash / local Redis URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
RESERVATION_TTL_MINUTES=10
```

### 4. Database setup

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to database (no migration files)
npm run db:seed       # Seed with 3 warehouses and 6 products
```

### 5. Start dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

1. Push to GitHub.
2. Import project in Vercel.
3. Set environment variables: `DATABASE_URL`, `REDIS_URL`, `CRON_SECRET` (any random string), `RESERVATION_TTL_MINUTES`.
4. Deploy. Vercel will automatically pick up `vercel.json` and schedule the cron job.
5. Run the seed: `npm run db:seed` (pointing at the production DATABASE_URL).

---

## How Reservation Expiry Works

### Production (primary): Vercel Cron Job

`vercel.json` schedules `GET /api/cron/expire-reservations` every minute. The handler:

1. Finds all `PENDING` reservations with `expiresAt < now`.
2. For each: decrements `reserved` on the matching `Stock` row and marks the `Reservation` as `RELEASED`.

The cron endpoint is protected by a `CRON_SECRET` bearer token. Vercel sets this header automatically; direct calls without the token get a 401.

**Latency**: worst-case ~60 s before an expired reservation is cleaned up. Acceptable for a 10-minute window.

### Belt-and-suspenders: Lazy cleanup on reads

`GET /api/products` calls `releaseExpiredReservations()` before computing available stock. Even if the cron misses a cycle, the listings page always shows accurate counts.

### Reservation page

The client-side countdown reaches zero and the UI shows "expired" immediately — no server call needed. The next action (confirm/cancel) triggers a server round-trip that catches the expired state and returns a 410.

---

## Concurrency Model

The core challenge: two simultaneous requests for the last unit of a SKU must not both succeed.

**Two-layer defence:**

### Layer 1 — Distributed lock (Redis)

Before entering the reserve logic, we attempt `SET lock:stock:<productId>:<warehouseId> <token> NX PX 5000`. Only one process wins the lock at a time. The other retries up to 3× with small backoff, then returns a 503.

This works across multiple Vercel function instances / Node.js processes.

### Layer 2 — `SELECT ... FOR UPDATE` in a Prisma transaction

Inside the lock, we use a raw SQL `SELECT … FOR UPDATE` on the `stocks` row. This serialises access at the database level — the fallback when:

- Redis is temporarily unavailable (the lock acquire returns `true` to allow through).
- Two requests somehow arrive with different lock keys (shouldn't happen, but belt-and-suspenders).

The check-then-act is fully atomic within a single DB transaction: read available stock → if enough, increment `reserved` and create `Reservation`.

**Result:** exactly one reservation succeeds when two concurrent requests race for the last unit.

---

## Idempotency (Bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` accept an `Idempotency-Key` header.

- **Reserve**: The key is stored on the `Reservation` row (`@unique`). If a request arrives with a key that already exists, the original `Reservation` is returned with HTTP 200 (instead of 201) — no new reservation is created.
- **Confirm**: If the reservation is already `CONFIRMED`, the current state is returned immediately without re-running confirmation logic.
- **Release**: Already idempotent by design — releasing a non-PENDING reservation returns the current state with 200.

---

## Trade-offs & What I'd Do Differently

| Area | Decision | Trade-off |
|------|----------|-----------|
| **Locking** | Redis NX + DB FOR UPDATE | Redis adds a dependency; fallback to DB-only is safe but slower |
| **Expiry precision** | Cron every minute + lazy cleanup | Up to 60 s delay; good enough for a 10-min window. A shorter cron (e.g. 10 s) would be more precise |
| **Stock model** | `total / reserved` on `Stock` row | Simple to query; `total` decrements on confirm (units are sold). Alternative: event-sourced ledger is more auditable |
| **Frontend state** | Client fetches on mount, pushes to `/reservations/:id` | No WebSocket/SSE — refresh-on-action is simple and correct. Real-time would use Server-Sent Events |
| **Image URLs** | Unsplash in seed | Production would use Cloudinary or S3 |
| **Testing** | Not included | With more time: Vitest unit tests for `reservation-service.ts`, Playwright e2e for the full flow |
| **Quantity selection** | Fixed at 1 per warehouse | UI could allow qty > 1; the API already supports it |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── products/route.ts         GET  /api/products
│   │   ├── warehouses/route.ts       GET  /api/warehouses
│   │   ├── reservations/
│   │   │   ├── route.ts              POST /api/reservations
│   │   │   └── [id]/
│   │   │       ├── confirm/route.ts  POST /api/reservations/:id/confirm
│   │   │       └── release/route.ts  POST /api/reservations/:id/release
│   │   └── cron/
│   │       └── expire-reservations/route.ts
│   ├── reservations/[id]/page.tsx    Checkout/reservation page
│   ├── page.tsx                      Product listing
│   └── layout.tsx
├── components/
│   ├── products/
│   │   ├── product-grid.tsx          Fetches + renders products
│   │   └── product-card.tsx          Card with per-warehouse reserve buttons
│   ├── reservations/
│   │   ├── reservation-detail.tsx    Confirm/cancel + live countdown
│   │   └── use-countdown.ts          Countdown hook
│   └── ui/                           shadcn-style primitives
├── lib/
│   ├── prisma.ts                     Singleton PrismaClient
│   ├── redis.ts                      Singleton ioredis client
│   ├── reservation-service.ts        Core business logic + locking
│   ├── schemas.ts                    Zod validation schemas
│   └── utils.ts                      Helpers (formatting, countdown)
├── types/index.ts                    Shared TypeScript types
└── prisma/
    ├── schema.prisma                 Data model
    └── seed.ts                       Sample data
```
