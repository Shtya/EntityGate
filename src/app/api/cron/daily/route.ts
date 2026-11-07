import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/server/modules/notifications/engine";
import { sendDailyDigests } from "@/server/modules/notifications/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never open by accident
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron calls this. It replaces the in-process scheduler, which can't live on serverless. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Not allowed" } }, { status: 401 });
  try {
    const reminders = await runReminders();
    const digests = await sendDailyDigests();
    return NextResponse.json({ data: { reminders, digests } });
  } catch (e) {
    console.error("[cron] daily run failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "Daily run failed" } }, { status: 500 });
  }
}
