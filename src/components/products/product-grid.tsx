// src/components/products/product-grid.tsx
"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "./product-card";
import type { ProductWithStock } from "@/types";
import { Loader2, PackageSearch } from "lucide-react";

export function ProductGrid() {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Loading products…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-destructive gap-3">
        <PackageSearch className="h-10 w-10" />
        <p className="font-medium">Failed to load products</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={fetchProducts}
          className="mt-2 text-sm underline text-primary hover:text-primary/80"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <PackageSearch className="h-10 w-10" />
        <p>No products found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product, i) => (
        <div
          key={product.id}
          className="animate-fade-in"
          style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
        >
          <ProductCard product={product} onReserved={fetchProducts} />
        </div>
      ))}
    </div>
  );
}
