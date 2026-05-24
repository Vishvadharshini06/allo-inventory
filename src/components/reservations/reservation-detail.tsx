// src/components/reservations/reservation-detail.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  MapPin,
  Hash,
  AlertTriangle,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useCountdown } from "./use-countdown";
import { formatPrice, formatDate, formatCountdown } from "@/lib/utils";
import type { ReservationWithRelations } from "@/types";

interface Props {
  reservation: ReservationWithRelations & { product: { price: string } };
}

const STATUS_CONFIG = {
  PENDING: { label: "Pending", variant: "warning" as const, icon: Clock },
  CONFIRMED: { label: "Confirmed", variant: "success" as const, icon: CheckCircle2 },
  RELEASED: { label: "Released", variant: "danger" as const, icon: XCircle },
};

export function ReservationDetail({ reservation: initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reservation, setReservation] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { seconds, expired, urgent } = useCountdown(reservation.expiresAt);

  const status = reservation.status;
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setError("This reservation expired before we could confirm it. Your stock has been released.");
          toast({ title: "Reservation expired", description: "The hold window passed before payment was confirmed.", variant: "destructive" });
        } else {
          setError(data.error ?? "Confirmation failed");
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
        // Refresh to show updated state
        if (data.reservation) setReservation({ ...reservation, ...data.reservation });
        return;
      }

      setReservation({ ...reservation, ...data.reservation });
      toast({ title: "Purchase confirmed!", description: "Your order has been placed successfully.", variant: "success" as never });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    setReleasing(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Cancellation failed");
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      setReservation({ ...reservation, ...data.reservation });
      toast({ title: "Reservation cancelled", description: "Your hold has been released. Stock is now available to others." });
      setTimeout(() => router.push("/"), 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back link */}
      <a href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        ← Back to products
      </a>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Reservation</h1>
          <p className="text-muted-foreground text-sm font-mono mt-1">{reservation.id}</p>
        </div>
        <Badge variant={statusConfig.variant} className="flex items-center gap-1.5 px-3 py-1.5 text-sm">
          <StatusIcon className="h-3.5 w-3.5" />
          {statusConfig.label}
        </Badge>
      </div>

      {/* Product info */}
      <div className="bg-white rounded-2xl border border-border p-5 flex gap-4">
        {reservation.product.imageUrl && (
          <div className="relative h-20 w-20 rounded-lg overflow-hidden shrink-0 bg-muted">
            <Image
              src={reservation.product.imageUrl}
              alt={reservation.product.name}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-mono">{reservation.product.sku}</p>
          <h2 className="font-semibold text-lg leading-snug">{reservation.product.name}</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {reservation.warehouse.name}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              Qty: {reservation.quantity}
            </span>
          </div>
          <p className="text-xl font-bold text-primary mt-2" style={{ fontFamily: "var(--font-display)" }}>
            {formatPrice(reservation.product.price)}
          </p>
        </div>
      </div>

      {/* Countdown — only show when PENDING */}
      {status === "PENDING" && (
        <div
          className={`bg-white rounded-2xl border p-5 flex items-center gap-4 ${
            urgent ? "border-orange-300 bg-orange-50" : expired ? "border-red-300 bg-red-50" : "border-border"
          }`}
        >
          <div
            className={`relative h-16 w-16 rounded-full flex items-center justify-center text-white font-bold text-sm ${
              expired ? "bg-destructive" : urgent ? "bg-orange-500" : "bg-primary"
            }`}
          >
            <Clock className="h-7 w-7" />
            {!expired && (
              <span className="absolute inset-0 rounded-full animate-pulse-ring border-2 border-current opacity-40" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
              {expired ? "Reservation expired" : "Time remaining"}
            </p>
            {expired ? (
              <p className="text-destructive font-semibold">This reservation has expired</p>
            ) : (
              <p className={`text-3xl font-bold tabular-nums ${urgent ? "text-orange-600 countdown-urgent" : "text-foreground"}`}>
                {formatCountdown(seconds)}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Expires {formatDate(reservation.expiresAt)}
            </p>
          </div>
        </div>
      )}

      {/* Confirmed state */}
      {status === "CONFIRMED" && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
          <CheckCircle2 className="h-10 w-10 text-green-600 shrink-0" />
          <div>
            <p className="font-semibold text-green-900">Purchase confirmed!</p>
            <p className="text-sm text-green-700">
              Confirmed at {formatDate(reservation.confirmedAt!)}
            </p>
          </div>
        </div>
      )}

      {/* Released state */}
      {status === "RELEASED" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-4">
          <XCircle className="h-10 w-10 text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-red-900">Reservation released</p>
            <p className="text-sm text-red-700">
              Released at {formatDate(reservation.releasedAt!)}. The stock is available again.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions — only show when PENDING */}
      {status === "PENDING" && !expired && (
        <div className="flex gap-3">
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={confirming || releasing}
            className="flex-1"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingBag className="h-4 w-4" />
            )}
            {confirming ? "Confirming…" : "Confirm purchase"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={handleCancel}
            disabled={confirming || releasing}
            className="flex-1"
          >
            {releasing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {releasing ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      )}

      {/* Expired but PENDING — offer to go back */}
      {status === "PENDING" && expired && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            The reservation window has passed. Return to products to try again.
          </p>
          <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
            <Package className="h-4 w-4" />
            Browse products
          </Button>
        </div>
      )}

      {/* Released / confirmed — go back */}
      {(status === "CONFIRMED" || status === "RELEASED") && (
        <Button variant="outline" className="w-full" onClick={() => router.push("/")}>
          <Package className="h-4 w-4" />
          Browse more products
        </Button>
      )}

      {/* Reservation details footer */}
      <div className="bg-muted/50 rounded-xl p-4 text-xs text-muted-foreground space-y-1">
        <p>Created: {formatDate(reservation.createdAt)}</p>
        <p>Warehouse: {reservation.warehouse.name} · {reservation.warehouse.location}</p>
        {reservation.idempotencyKey && (
          <p>Idempotency key: <span className="font-mono">{reservation.idempotencyKey}</span></p>
        )}
      </div>
    </div>
  );
}
