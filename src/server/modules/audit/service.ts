import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { parseDateOnly } from "@/lib/dates";

/** A regex alone lets "2026-02-30" through, which then crashes as a 500. */
const dateOnly = z.string().refine((value) => {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}, "errors.outOfRange");

export const auditQuery = z.object({
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(50).optional(),
  actorId: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  cursor: z.string().max(50).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.infer<typeof auditQuery>;

export async function listAuditEvents(q: AuditQuery) {
  const where: Prisma.AuditEventWhereInput = {
    entityType: q.entityType || undefined,
    entityId: q.entityId || undefined,
    actorId: q.actorId || undefined,
    action: q.action || undefined,
    createdAt: {
      gte: q.from ? parseDateOnly(q.from) : undefined,
      lt: q.to ? new Date(parseDateOnly(q.to).getTime() + 86_400_000) : undefined,
    },
  };
  const rows = await db.auditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
  const hasMore = rows.length > q.take;
  const items = hasMore ? rows.slice(0, q.take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function auditFacets() {
  const [types, actions] = await Promise.all([
    db.auditEvent.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    db.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  return { entityTypes: types.map((t) => t.entityType), actions: actions.map((a) => a.action) };
}
