import "server-only";
import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import type { DbOrTx } from "@/server/db";

type Json = Prisma.InputJsonValue;

export interface AuditInput {
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Converts Decimal/Date/BigInt to JSON-safe values. */
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null && "toFixed" in v && typeof (v as { toFixed: unknown }).toFixed === "function") {
    return (v as { toString(): string }).toString(); // Prisma.Decimal
  }
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

/** Keep only fields that actually changed so the audit trail stays readable. */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) {
    return { before: before ? (plain(before) as Record<string, unknown>) : null, after: after ? (plain(after) as Record<string, unknown>) : null };
  }
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "updatedAt") continue;
    const pb = plain(before[key]);
    const pa = plain(after[key]);
    if (JSON.stringify(pb) !== JSON.stringify(pa)) {
      b[key] = pb;
      a[key] = pa;
    }
  }
  return { before: b, after: a };
}

/** IP / user agent of the current request; null outside a request (jobs, seeds). */
async function requestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    return { ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

export async function writeAudit(client: DbOrTx, input: AuditInput) {
  const changes = diff(input.before, input.after);
  const ctx = await requestContext();
  await client.auditEvent.create({
    data: {
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: (changes.before ?? undefined) as Json | undefined,
      after: (changes.after ?? undefined) as Json | undefined,
      ipAddress: input.ipAddress ?? ctx.ipAddress,
      userAgent: input.userAgent ?? ctx.userAgent,
    },
  });
}
