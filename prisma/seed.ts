// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing data
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Mumbai Central", location: "Mumbai, Maharashtra" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi North", location: "New Delhi, Delhi" },
    }),
    prisma.warehouse.create({
      data: { name: "Bangalore Tech Park", location: "Bangalore, Karnataka" },
    }),
  ]);

  console.log("✅ Warehouses created");

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Noise-Cancelling Headphones",
        description:
          "Premium over-ear headphones with 30-hour battery life and active noise cancellation.",
        price: 12999,
        sku: "WNC-HP-001",
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Gaming Keyboard",
        description:
          "RGB backlit mechanical keyboard with Cherry MX switches and N-key rollover.",
        price: 8499,
        sku: "MKB-GAM-002",
        imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "4K Webcam",
        description:
          "Ultra HD webcam with auto-focus, HDR, and built-in microphone array.",
        price: 6999,
        sku: "WCM-4K-003",
        imageUrl: "https://images.unsplash.com/photo-1609592806596-b996bfda26b4?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Ergonomic Office Chair",
        description:
          "Lumbar-support mesh chair with adjustable armrests and breathable fabric.",
        price: 24999,
        sku: "CHR-ERG-004",
        imageUrl: "https://images.unsplash.com/photo-1592078615290-033ee584e267?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Smart LED Desk Lamp",
        description:
          "Colour-temperature adjustable LED lamp with wireless charging base.",
        price: 3499,
        sku: "LMP-LED-005",
        imageUrl: "https://images.unsplash.com/photo-1544269828-4f6d0e3b4e01?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Portable SSD 1TB",
        description:
          "Ultra-fast NVMe portable SSD with USB-C and read speeds up to 1,050 MB/s.",
        price: 9999,
        sku: "SSD-1TB-006",
        imageUrl: "https://images.unsplash.com/photo-1597740985671-2a8a3b80502e?w=400",
      },
    }),
  ]);

  console.log("✅ Products created");

  // Create stock entries
  const stockData = [
    // WNC Headphones
    { productId: products[0].id, warehouseId: mumbai.id, total: 15, reserved: 0 },
    { productId: products[0].id, warehouseId: delhi.id, total: 8, reserved: 0 },
    { productId: products[0].id, warehouseId: bangalore.id, total: 3, reserved: 0 },
    // Mechanical Keyboard
    { productId: products[1].id, warehouseId: mumbai.id, total: 20, reserved: 0 },
    { productId: products[1].id, warehouseId: delhi.id, total: 12, reserved: 0 },
    { productId: products[1].id, warehouseId: bangalore.id, total: 5, reserved: 0 },
    // 4K Webcam
    { productId: products[2].id, warehouseId: mumbai.id, total: 10, reserved: 0 },
    { productId: products[2].id, warehouseId: bangalore.id, total: 2, reserved: 0 },
    // Ergonomic Chair
    { productId: products[3].id, warehouseId: mumbai.id, total: 5, reserved: 0 },
    { productId: products[3].id, warehouseId: delhi.id, total: 3, reserved: 0 },
    // Desk Lamp
    { productId: products[4].id, warehouseId: mumbai.id, total: 30, reserved: 0 },
    { productId: products[4].id, warehouseId: delhi.id, total: 25, reserved: 0 },
    { productId: products[4].id, warehouseId: bangalore.id, total: 18, reserved: 0 },
    // Portable SSD
    { productId: products[5].id, warehouseId: mumbai.id, total: 1, reserved: 0 },
    { productId: products[5].id, warehouseId: delhi.id, total: 7, reserved: 0 },
    { productId: products[5].id, warehouseId: bangalore.id, total: 4, reserved: 0 },
  ];

  await prisma.stock.createMany({ data: stockData });

  console.log("✅ Stock created");
  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
