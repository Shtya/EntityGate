import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/rbac/policy";
import { PAGE_SIZE, pageQuery } from "@/server/validation";

export const listNotificationsQuery = z.object({ ...pageQuery, view: z.enum(["open", "all"]).catch("open").default("open") });

const OPEN = ["UNREAD", "READ", "SNOOZED"] as const;

export async function listNotifications(actor: Actor, q: z.infer<typeof listNotificationsQuery>) {
  const where: Prisma.NotificationWhereInput = { userId: actor.id, ...(q.view === "open" ? { status: { in: [...OPEN] } } : {}) };
  const [rows, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.notification.count({ where }),
  ]);
  return { rows, total, page: q.page };
}

export async function recentNotifications(actor: Actor) {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: actor.id, status: { in: ["UNREAD", "READ"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.count({ where: { userId: actor.id, status: "UNREAD" } }),
  ]);
  return { rows, unread };
}

export const actSchema = z.object({
  action: z.enum(["read", "ack", "resolve", "snooze"]),
  hours: z.number().int().min(1).max(24 * 30).optional(),
});

/** Only the person a notification belongs to can act on it. */
export async function actOnNotification(actor: Actor, id: string, input: z.infer<typeof actSchema>) {
  const row = await db.notification.findFirst({ where: { id, userId: actor.id } });
  if (!row) throw notFound();
  const data: Prisma.NotificationUpdateInput =
    input.action === "read"
      ? { status: row.status === "UNREAD" ? "READ" : row.status }
      : input.action === "ack"
        ? { status: "ACKED", ackedAt: new Date() }
        : input.action === "resolve"
          ? { status: "RESOLVED" }
          : { status: "SNOOZED", snoozedUntil: new Date(Date.now() + (input.hours ?? 24) * 3_600_000) };
  await db.notification.update({ where: { id }, data });
  return { id };
}

export async function markAllRead(actor: Actor) {
  const { count } = await db.notification.updateMany({ where: { userId: actor.id, status: "UNREAD" }, data: { status: "READ" } });
  return { count };
}

export const ruleSchema = z.object({
  offsets: z.string({ error: "validation.required" }).trim().regex(/^-?\d{1,4}(\s*,\s*-?\d{1,4})*$/, "validation.offsets"),
  email: z.boolean().nullish(),
  active: z.boolean().nullish(),
  escalateAfterHours: z.coerce.number().int().min(1).max(8760).nullish().or(z.literal("").transform(() => null)),
});

export async function updateRule(actor: Actor, id: string, input: z.infer<typeof ruleSchema>) {
  const before = await db.reminderRule.findUnique({ where: { id } });
  if (!before) throw notFound();
  const offsetsDays = [...new Set(input.offsets.split(",").map((s) => Number(s.trim())))].sort((a, b) => a - b);
  if (!offsetsDays.length) throw invalid("errors.validation", [{ path: "offsets", message: "validation.required" }]);
  return db.$transaction(async (tx) => {
    const after = await tx.reminderRule.update({
      where: { id },
      data: { offsetsDays, channels: input.email ? ["in_app", "email"] : ["in_app"], active: !!input.active, escalateAfterHours: input.escalateAfterHours ?? null },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "reminder_rule", entityId: id, action: "update", before, after });
    return { id };
  });
}
