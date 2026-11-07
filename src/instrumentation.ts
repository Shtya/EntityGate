/** On Vercel nothing stays running to host a scheduler, so Vercel Cron calls /api/cron/daily instead. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startJobs } = await import("./server/jobs");
    void startJobs();
  }
}
