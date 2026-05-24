// src/app/api/reservations/[id]/release/route.ts
import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservation-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {

  const { id } = params;

  try {
    const result = await releaseReservation(id);

    if (!result.success) {
      if (result.reason === "not_found") {
        return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
      }
      if (result.reason === "already_settled") {
        // Idempotent – return current state
        const current = await prisma.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });
        return NextResponse.json({ reservation: current }, { status: 200 });
      }
    }

    const full = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    return NextResponse.json({ reservation: full }, { status: 200 });
  } catch (error) {
    console.error(`[POST /api/reservations/${id}/release]`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
