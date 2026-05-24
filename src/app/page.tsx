// src/app/page.tsx
import { ProductGrid } from "@/components/products/product-grid";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10 animate-fade-in">
        <h1 className="text-4xl lg:text-5xl text-foreground mb-3">
          Our Products
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Reserve your items and complete your purchase with confidence. 
          Each reservation holds your stock for 10 minutes while you checkout.
        </p>
      </div>
      <ProductGrid />
    </div>
  );
}
