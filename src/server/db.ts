import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma's default pool scales with CPU count, which can exceed everything Supabase's session
 * pooler allows (15 clients) and lock out other processes. DATABASE_URL's own setting wins.
 */
function poolUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", process.env.DB_POOL_SIZE || "5");
  return url.toString();
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: poolUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
export type DbOrTx = typeof db | Tx;
