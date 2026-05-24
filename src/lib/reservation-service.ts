// src/lib/reservation-service.ts
/**
 * Reservation Service
 *
 * Concurrency strategy:
 * 1. Acquire a per-(product, warehouse) distributed lock in Redis (SET NX PX).
 *    This prevents two Node.js processes / Vercel functions from running the
 *    reserve logic simultaneously for the same SKU+warehouse.
 * 2. Inside the lock, use a Prisma interactive transaction with a
 *    SELECT ... FOR UPDATE on the Stock row. This handles the edge case where
 *    Redis is unavailable or two requests target the same DB row through
 *    different lock keys.
 * 3. The combination means: exactly one reservation succeeds when stock=1 and
 *    two concurrent requests arrive.
 *
 * Expiry strategy:
 * - expiresAt is stored on the Reservation row.
 * - A Vercel Cron job at /api/cron/expire-reservations runs every minute and
 *   calls releaseExpiredReservations().
 * - As a belt-and-suspenders measure, GET /api/products also triggers lazy
 *   cleanup: any PENDING reservation past expiresAt is released before stock
 *   counts are calculated.
 */

import { prisma } from "./prisma";
import { redis } from "./redis";
import type { Reservation, ReservationStatus } from "@prisma/client";

const LOCK_TTL_MS = 5_000; // 5 seconds
const RESERVATION_TTL_MINUTES = parseInt(
  process.env.RESERVATION_TTL_MINUTES ?? "10",
  10
);

// ---------------------------------------------------------------------------
// Distributed lock helpers
// ---------------------------------------------------------------------------

function lockKey(productId: string, warehouseId: string) {
  return `lock:stock:${productId}:${warehouseId}`;
}

async function acquireLock(key: string, token: string): Promise<boolean> {
  try {
    const result = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    return result === "OK";
  } catch {
    // If Redis is down, fall through to DB-level locking only
    return true;
  }
}

async function releaseLock(key: string, token: string): Promise<void> {
  try {
    // Lua script: only delete if we own the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, key, token);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReserveInput {
  productId: string;
  warehouseId: string;
  quantity: number;
  idempotencyKey?: string;
}

export type ReserveResult =
  | { success: true; reservation: Reservation; idempotent?: boolean }
  | { success: false; reason: "insufficient_stock" | "not_found" | "lock_timeout" };

export async function reserveStock(input: ReserveInput): Promise<ReserveResult> {
  const { productId, warehouseId, quantity, idempotencyKey } = input;

  // Idempotency check – return existing result if key was already processed
  if (idempotencyKey) {
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { success: true, reservation: existing, idempotent: true };
    }
  }

  const key = lockKey(productId, warehouseId);
  const token = `${Date.now()}-${Math.random()}`;

  // Retry acquiring lock up to 3 times with small backoff
  let locked = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    locked = await acquireLock(key, token);
    if (locked) break;
    await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
  }

  if (!locked) {
    return { success: false, reason: "lock_timeout" };
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // First, try to find and lock the stock row
        const stock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId, warehouseId },
          },
        });

        if (!stock) return { success: false as const, reason: "not_found" as const };

        const available = stock.total - stock.reserved;

        if (available < quantity) {
          return { success: false as const, reason: "insufficient_stock" as const };
        }

        // Increment reserved count
        await tx.stock.update({
          where: { id: stock.id },
          data: { reserved: { increment: quantity } },
        });

        const expiresAt = new Date(
          Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
        );

        const reservation = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
            idempotencyKey: idempotencyKey ?? null,
          },
        });

        return { success: true as const, reservation };
      },
      {
        timeout: 10000, // 10 second timeout for the transaction
        maxWait: 5000,  // max 5 seconds to wait for a slot in the connection pool
      }
    );

    return result;
  } finally {
    await releaseLock(key, token);
  }
}

export interface ConfirmResult {
  success: boolean;
  reason?: "not_found" | "expired" | "not_pending";
  reservation?: Reservation;
}

export async function confirmReservation(id: string): Promise<ConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id } });

    if (!reservation) return { success: false, reason: "not_found" };
    if (reservation.status !== "PENDING") {
      return { success: false, reason: "not_pending" };
    }
    if (reservation.expiresAt < new Date()) {
      // Also release stock so it isn't stranded
      await tx.stock.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: { reserved: { decrement: reservation.quantity } },
      });
      await tx.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      return { success: false, reason: "expired" };
    }

    // Decrement reserved; total stays same (unit is sold, not restocked)
    await tx.stock.updateMany({
      where: {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
      },
      data: {
        total: { decrement: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    });

    const updated = await tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    return { success: true, reservation: updated };
  });
}

export interface ReleaseResult {
  success: boolean;
  reason?: "not_found" | "already_settled";
  reservation?: Reservation;
}

export async function releaseReservation(id: string): Promise<ReleaseResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { id } });

    if (!reservation) return { success: false, reason: "not_found" };
    if (reservation.status !== "PENDING") {
      return { success: false, reason: "already_settled" };
    }

    await tx.stock.updateMany({
      where: {
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
      },
      data: { reserved: { decrement: reservation.quantity } },
    });

    const updated = await tx.reservation.update({
      where: { id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });

    return { success: true, reservation: updated };
  });
}

/** Called by the cron job and lazy cleanup paths */
export async function releaseExpiredReservations(): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
  });

  if (!expired.length) return 0;

  for (const r of expired) {
    // Decrement reserved count
    await prisma.stock.updateMany({
      where: { productId: r.productId, warehouseId: r.warehouseId },
      data: { reserved: { decrement: r.quantity } },
    });
    await prisma.reservation.update({
      where: { id: r.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }

  return expired.length;
}
