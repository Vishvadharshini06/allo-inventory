// src/app/reservations/[id]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReservationDetail } from "@/components/reservations/reservation-detail";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function ReservationPage({ params }: Props) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) notFound();

  // Serialize Decimal to string
  const serialized = {
    ...reservation,
    product: {
      ...reservation.product,
      price: reservation.product.price.toString(),
    },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
      <ReservationDetail reservation={serialized as Parameters<typeof ReservationDetail>[0]["reservation"]} />
    </div>
  );
}
