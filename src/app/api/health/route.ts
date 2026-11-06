import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness for the container healthcheck. Unauthenticated, no data exposed. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
