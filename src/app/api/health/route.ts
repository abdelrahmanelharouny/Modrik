import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public, deliberately minimal readiness probe for load balancers and deploy
// platforms. Never return connection strings, provider state, or exception text.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ status: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": "5" },
    });
  }
}
