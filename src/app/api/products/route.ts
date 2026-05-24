// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Lazy cleanup: release expired reservations so stock counts are accurate
    await releaseExpiredReservations();

    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Add derived `available` field to each stock entry
    const enriched = products.map((p) => ({
      ...p,
      price: p.price.toString(),
      stocks: p.stocks.map((s) => ({
        ...s,
        available: s.total - s.reserved,
      })),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
