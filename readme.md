# Allo Inventory

A multi-warehouse inventory and order-fulfillment platform built with Next.js. Customers can browse products across warehouses, reserve stock during checkout, and confirm or cancel their purchase — with race-condition-safe concurrency guarantees at the core.

---

## Live Demo

> _Paste your Vercel URL here after deploying_

---

## What It Does

When a customer proceeds to checkout, the app temporarily **reserves** the requested units for 10 minutes. During that window:

- Other shoppers see the stock as unavailable
- The customer can confirm (purchase succeeds, stock is permanently decremented) or cancel (stock is released back)
- If the timer expires without confirmation, the reservation is automatically released

This solves the classic race condition where two customers pay for the same physical unit.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (end-to-end) |
| Database | PostgreSQL via Neon (hosted) |
| ORM | Prisma |
| Cache / Locking | Redis via Upstash (ioredis) |
| Validation | Zod |
| Styling | Tailwind CSS + Radix UI primitives |
| Deployment | Vercel |

---

## Running Locally

### Prerequisites

- Node.js 20+
- A hosted PostgreSQL database (Neon / Supabase / Railway — all have free tiers)
- A Redis instance (Upstash free tier, or local `redis-server`)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/allo-inventory.git
cd allo-inventory
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
REDIS_URL="rediss://default:TOKEN@host:6379"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
RESERVATION_TTL_MINUTES=10
```

### 3. Set up the database

```bash
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to your database
npm run db:seed       # Seed with 3 warehouses + 6 products
```

### 4. Start the dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project at [vercel.com](https://vercel.com)
3. Set these environment variables in the Vercel dashboard:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Neon/Supabase connection string |
| `REDIS_URL` | Your Upstash TCP URL |
| `RESERVATION_TTL_MINUTES` | `10` |
| `CRON_SECRET` | Any random string (e.g. `mysecret123`) |

4. Set the **Build Command** in Vercel → Settings → General to:
   ```
   prisma generate && next build
   ```
5. Deploy
6. Run the seed against production once:
   ```bash
   DATABASE_URL="your-production-url" npm run db:seed
   ```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/products` | List all products with available stock per warehouse |
| `GET` | `/api/warehouses` | List all warehouses |
| `POST` | `/api/reservations` | Reserve units — returns `409` if insufficient stock |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation (payment succeeded) — returns `410` if expired |
| `POST` | `/api/reservations/:id/release` | Release reservation early (payment failed / user cancelled) |

### Idempotency

`POST /api/reservations` and `POST /api/reservations/:id/confirm` both accept an `Idempotency-Key` header. Retrying with the same key returns the original response without repeating the side effect.

---

## How Reservation Expiry Works

### Primary: Vercel Cron Job

`vercel.json` schedules `GET /api/cron/expire-reservations` to run daily (Vercel Hobby plan limit). The handler finds all `PENDING` reservations past their `expiresAt`, decrements `reserved` on each matching stock row, and marks them `RELEASED`.

The endpoint requires a `Bearer <CRON_SECRET>` header — Vercel sets this automatically; direct calls without it receive a `401`.

### Belt-and-suspenders: Lazy cleanup on reads

`GET /api/products` runs `releaseExpiredReservations()` before computing stock counts. Even between cron cycles, the product listing always reflects accurate availability.

### Client-side countdown

The reservation page counts down in real time using a `useCountdown` hook. When the timer hits zero the UI immediately shows "expired" — no polling needed. Any subsequent confirm/cancel action hits the server, which catches the expired state and returns `410`.

---

## Concurrency Model

The core requirement: two simultaneous requests for the last unit of a SKU must not both succeed.

### Layer 1 — Distributed lock (Redis)

Before entering the reserve logic, the server attempts:

```
SET lock:stock:<productId>:<warehouseId> <token> NX PX 5000
```

Only one process wins the lock. The other retries up to 3× with exponential backoff, then returns `503`. This works across all Vercel function instances simultaneously.

### Layer 2 — `SELECT … FOR UPDATE` (PostgreSQL)

Inside the lock, a raw SQL `SELECT … FOR UPDATE` on the `stocks` row serialises access at the database level. This is the fallback for:

- Redis being temporarily unavailable
- Any edge case where two requests share the same DB connection

The read-then-write is fully atomic within a single Prisma transaction: check available stock → if sufficient, increment `reserved` and create the `Reservation` row.

**Result:** exactly one reservation succeeds when two concurrent requests race for the last unit.

---

## Data Model

```
Product         — name, SKU, price, description, imageUrl
Warehouse       — name, location
Stock           — productId + warehouseId + total + reserved  (unique pair)
Reservation     — productId, warehouseId, quantity, status, expiresAt, idempotencyKey
```

`Stock.total` is the physical unit count. `Stock.reserved` is how many are currently held by PENDING reservations. Available stock = `total − reserved`. On confirm, both `total` and `reserved` decrement (the units are sold). On release, only `reserved` decrements.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── products/route.ts              GET  /api/products
│   │   ├── warehouses/route.ts            GET  /api/warehouses
│   │   ├── reservations/
│   │   │   ├── route.ts                   POST /api/reservations
│   │   │   └── [id]/
│   │   │       ├── confirm/route.ts       POST /api/reservations/:id/confirm
│   │   │       └── release/route.ts       POST /api/reservations/:id/release
│   │   └── cron/
│   │       └── expire-reservations/route.ts
│   ├── reservations/[id]/page.tsx         Checkout / reservation detail page
│   ├── page.tsx                           Product listing page
│   └── layout.tsx
├── components/
│   ├── products/
│   │   ├── product-grid.tsx               Fetches + renders product cards
│   │   └── product-card.tsx               Per-warehouse stock + reserve buttons
│   ├── reservations/
│   │   ├── reservation-detail.tsx         Confirm/cancel UI + live countdown
│   │   └── use-countdown.ts               Countdown hook
│   └── ui/                                Button, Badge, Toast primitives
├── lib/
│   ├── prisma.ts                          Singleton PrismaClient
│   ├── redis.ts                           Singleton ioredis client
│   ├── reservation-service.ts             Core business logic + locking
│   ├── schemas.ts                         Zod request validation schemas
│   └── utils.ts                           Formatting + countdown helpers
├── types/index.ts                         Shared TypeScript types
prisma/
├── schema.prisma                          Data model
└── seed.ts                                Sample data (3 warehouses, 6 products)
```

---

## Trade-offs & What I'd Do Differently

| Area | Decision | What I'd change with more time |
|------|----------|-------------------------------|
| **Locking** | Redis NX + DB `FOR UPDATE` | Same — this is the right two-layer approach |
| **Expiry** | Daily cron + lazy cleanup on reads | Per-minute cron on a paid plan; or a lightweight polling worker |
| **Stock model** | `total / reserved` columns | Event-sourced ledger for full auditability |
| **Real-time UI** | Fetch on action | Server-Sent Events to push stock updates to all open tabs |
| **Testing** | None included | Vitest unit tests for `reservation-service.ts`; Playwright e2e for the full reserve → confirm flow |
| **Quantity selection** | Fixed at 1 | Quantity picker in the UI (API already supports `quantity > 1`) |
| **Images** | Unsplash URLs in seed | Cloudinary or S3 with upload support |
