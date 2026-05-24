// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservation-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {

  const { id } = params;

  // Idempotency: if already confirmed, return existing state
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;
  if (idempotencyKey) {
    const existing = await prisma.reservation.findFirst({
      where: { id, status: "CONFIRMED" },
      include: { product: true, warehouse: true },
    });
    if (existing) {
      return NextResponse.json({ reservation: existing }, { status: 200 });
    }
  }

  try {
    const result = await confirmReservation(id);

    if (!result.success) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
      }
      if (result.reason === "expired") {
        return NextResponse.json(
          { error: "Reservation has expired and has been released." },
          { status: 410 }
        );
      }
      if (result.reason === "not_pending") {
        return NextResponse.json(
          { error: "Reservation is not in a PENDING state." },
          { status: 409 }
        );
      }
    }

    const full = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    return NextResponse.json({ reservation: full }, { status: 200 });
  } catch (error) {
    console.error(`[POST /api/reservations/${id}/confirm]`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
