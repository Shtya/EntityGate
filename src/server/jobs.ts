import "server-only";
import { PgBoss } from "pg-boss";
import { runReminders } from "@/server/modules/notifications/engine";
import { sendDailyDigests } from "@/server/modules/notifications/mail";

const REMINDERS = "reminders-hourly";
const DIGEST = "digest-daily";

/**
 * Background jobs on Postgres (no Redis). Runs inside the app process via instrumentation.ts, and
 * pg-boss's locking means several app instances still run each job once. Set JOBS_ENABLED=false to turn off.
 */
export async function startJobs() {
  if (process.env.JOBS_ENABLED === "false") return;
  const state = globalThis as unknown as { egJobs?: boolean };
  if (state.egJobs) return; // dev hot reload
  state.egJobs = true;
  try {
    // Same TLS behaviour Prisma uses for sslmode=require (encrypted). node-postgres would otherwise also
    // demand a verified chain, which pooled providers like Supabase fail unless their CA is installed.
    const url = new URL(process.env.DATABASE_URL!);
    if (url.searchParams.get("sslmode") === "require") url.searchParams.set("uselibpqcompat", "true");
    const boss = new PgBoss({ connectionString: url.toString(), max: 3 });
    boss.on("error", (e: Error) => console.error("[jobs]", e.message));
    await boss.start();
    await boss.createQueue(REMINDERS);
    await boss.createQueue(DIGEST);
    await boss.schedule(REMINDERS, "0 * * * *", null, { tz: "Asia/Riyadh" });
    await boss.schedule(DIGEST, "0 8 * * *", null, { tz: "Asia/Riyadh" });
    await boss.work(REMINDERS, async () => {
      await runReminders();
    });
    await boss.work(DIGEST, async () => {
      await sendDailyDigests();
    });
    console.log("[jobs] scheduler started");
  } catch (e) {
    // Reminders can still be run by hand; the app itself must not go down with the scheduler.
    state.egJobs = false;
    console.error("[jobs] scheduler failed to start:", e instanceof Error ? e.message : e);
  }
}
