import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.API_KEY || "allo-inventory-secret-key-2024";

export function verifyApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get("X-API-Key");
  return apiKey === API_KEY;
}

export function requireApiKey(req: NextRequest): NextResponse | null {
  if (!verifyApiKey(req)) {
    return NextResponse.json(
      { error: "Unauthorized - Invalid or missing API key" },
      { status: 401 }
    );
  }
  return null;
}
