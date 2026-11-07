import "server-only";
import { PrismaClient } from "@prisma/client";
import { isServerless } from "@/lib/app-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma's default pool scales with CPU count, which can exceed everything Supabase's session pooler
 * allows (15 clients) and lock out other processes. Serverless is stricter still: every instance
 * holds its own pool, so session mode runs out almost at once. There, connect through the pooler's
 * transaction mode (port 6543), which shares connections between instances and needs pgbouncer=true.
 * Settings already in DATABASE_URL win.
 */
export function poolUrl(raw = process.env.DATABASE_URL, serverless = isServerless()): string | undefined {
  if (!raw) return undefined;
  const url = new URL(raw);
  if (serverless && url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") url.port = "6543";
  const set = (key: string, value: string) => {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  };
  if (url.port === "6543") set("pgbouncer", "true");
  set("connection_limit", process.env.DB_POOL_SIZE || (serverless ? "3" : "5"));
  if (serverless) set("pool_timeout", "20");
  return url.toString();
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: poolUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Kept for the life of the process in production too, so bundled routes can't each open a pool.
globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;
