// src/app/api/cron/expire-reservations/route.ts
/**
 * Vercel Cron Job: runs every minute via vercel.json cron config.
 * Releases all PENDING reservations whose expiresAt is in the past.
 *
 * Add to vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }]
 * }
 *
 * The CRON_SECRET env var protects this endpoint from unauthorized invocations.
 */
import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, Vercel sets this header automatically when CRON_SECRET is configured.
  // Allow unauthenticated access in dev for ease of testing.
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await releaseExpiredReservations();
    return NextResponse.json({ released, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[Cron expire-reservations]", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
