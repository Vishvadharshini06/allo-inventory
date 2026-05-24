// src/components/products/product-card.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ShoppingBag, Package, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { formatPrice } from "@/lib/utils";
import type { ProductWithStock } from "@/types";

interface Props {
  product: ProductWithStock;
  onReserved?: () => void;
}

export function ProductCard({ product, onReserved }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reserving, setReserving] = useState<string | null>(null); // warehouseId
  const [error, setError] = useState<string | null>(null);

  const totalAvailable = product.stocks.reduce(
    (sum, s) => sum + (s.total - s.reserved),
    0
  );

  async function handleReserve(warehouseId: string, quantity = 1) {
    setReserving(warehouseId);
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, warehouseId, quantity }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("Not enough stock available. Someone may have just reserved the last unit.");
          toast({ title: "Stock unavailable", description: data.error, variant: "destructive" });
        } else {
          setError(data.error ?? "Reservation failed");
          toast({ title: "Error", description: data.error, variant: "destructive" });
        }
        return;
      }

      toast({ title: "Reserved!", description: `${product.name} held for 10 minutes.`, variant: "success" as never });
      onReserved?.();
      router.push(`/reservations/${data.reservation.id}`);
    } catch {
      setError("Network error. Please try again.");
      toast({ title: "Network error", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setReserving(null);
    }
  }

  return (
    <div className="group bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col">
      {/* Product Image */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Package className="h-12 w-12" />
          </div>
        )}
        <div className="absolute top-3 right-3">
          {totalAvailable === 0 ? (
            <Badge variant="danger">Out of stock</Badge>
          ) : totalAvailable <= 3 ? (
            <Badge variant="warning">Only {totalAvailable} left</Badge>
          ) : (
            <Badge variant="success">{totalAvailable} available</Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-5 gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-mono mb-1">{product.sku}</p>
          <h2 className="font-semibold text-foreground text-lg leading-snug">{product.name}</h2>
          {product.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
          )}
        </div>

        <div className="text-2xl font-bold text-primary" style={{ fontFamily: "var(--font-display)" }}>
          {formatPrice(product.price)}
        </div>

        {/* Stock per warehouse */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stock by warehouse
          </p>
          {product.stocks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No stock data</p>
          ) : (
            product.stocks.map((stock) => {
              const available = stock.total - stock.reserved;
              return (
                <div
                  key={stock.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{stock.warehouse.name}</span>
                    <span className="text-muted-foreground ml-1">
                      · {available} avail / {stock.reserved} reserved
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={available > 0 ? "default" : "outline"}
                    disabled={available === 0 || reserving === stock.warehouseId}
                    onClick={() => handleReserve(stock.warehouseId)}
                    className="shrink-0 h-8 text-xs"
                  >
                    {reserving === stock.warehouseId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <ShoppingBag className="h-3 w-3" />
                        Reserve
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-red-50 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
