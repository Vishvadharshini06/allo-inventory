// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CreateReservationSchema } from "@/lib/schemas";
import { reserveStock } from "@/lib/reservation-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {

  try {
    const body = await req.json();
    const parsed = CreateReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

    const result = await reserveStock({ ...parsed.data, idempotencyKey });

    if (!result.success) {
      if (result.reason === "insufficient_stock") {
        return NextResponse.json(
          { error: "Not enough stock available for the requested quantity." },
          { status: 409 }
        );
      }
      if (result.reason === "not_found") {
        return NextResponse.json(
          { error: "Product/warehouse combination not found." },
          { status: 404 }
        );
      }
      if (result.reason === "lock_timeout") {
        return NextResponse.json(
          { error: "System is busy. Please try again shortly." },
          { status: 503 }
        );
      }
    }

    if (!result.success) {
      return NextResponse.json({ error: "Reservation failed." }, { status: 500 });
    }

    // Fetch full reservation with relations for the response
    const full = await prisma.reservation.findUnique({
      where: { id: result.reservation.id },
      include: { product: true, warehouse: true },
    });

    const status = result.idempotent ? 200 : 201;
    return NextResponse.json({ reservation: full }, { status });
  } catch (error) {
    console.error("[POST /api/reservations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
