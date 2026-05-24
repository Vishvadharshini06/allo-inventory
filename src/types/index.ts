// src/types/index.ts
import type { Reservation, Product, Warehouse, Stock, ReservationStatus } from "@prisma/client";

export type { ReservationStatus };

export type StockWithRelations = Stock & {
  warehouse: Warehouse;
};

export type ProductWithStock = Product & {
  stocks: StockWithRelations[];
};

export type ReservationWithRelations = Reservation & {
  product: Product;
  warehouse: Warehouse;
};

export interface ApiError {
  error: string;
  code?: string;
}

export interface ReservationResponse {
  reservation: ReservationWithRelations;
}
