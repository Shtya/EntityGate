/**
 * In-process sliding-window limiter. Good enough for a single app instance;
 * swap for a Postgres/Redis-backed limiter if we scale horizontally.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const since = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (!v.some((t) => t > since)) buckets.delete(k);
  }
  return true;
}

export function __resetRateLimits() {
  buckets.clear();
}
