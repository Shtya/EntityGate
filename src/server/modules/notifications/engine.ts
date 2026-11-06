import "server-only";
import type { NotificationStatus, Prisma, ReminderRule, Severity } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { activeOn, nextNumber, pad } from "@/server/util";
import { formatDate, todayDate, toDateOnly } from "@/lib/dates";
import { clientHealth, daysPastDue } from "@/lib/finance";
import { deliverEmail } from "./mail";

interface Candidate {
  entityType: string;
  entityId: string;
  /** The date offsets are measured from. */
  anchor: Date;
  title: string;
  params: Record<string, string | number>;
  href: string;
  severity: Severity;
  ownerIds: string[];
}

/**
 * The offset that applies today, or null if none has been reached.
 * Using "latest passed" rather than "exactly today" means a day of downtime can't lose a reminder.
 */
export function dueOffset(offsets: number[], anchor: Date, today: Date): number | null {
  const elapsed = daysPastDue(anchor, today);
  const passed = offsets.filter((o) => o <= elapsed);
  return passed.length ? Math.max(...passed) : null;
}

const ACTIVE_NOTIFICATION: NotificationStatus[] = ["UNREAD", "READ", "SNOOZED"];

async function usersWithRole(key: string): Promise<string[]> {
  const rows = await db.userRole.findMany({ where: { role: { key }, user: { status: "ACTIVE" } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function clientOwners(clientIds: string[]): Promise<Map<string, string[]>> {
  const rows = await db.accountAssignment.findMany({ where: { clientId: { in: clientIds }, role: "OWNER", ...activeOn() }, select: { clientId: true, userId: true } });
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.clientId, [...(map.get(r.clientId) ?? []), r.userId]);
  return map;
}

async function recipients(rule: ReminderRule, c: Candidate): Promise<string[]> {
  const ids = new Set<string>();
  for (const r of rule.recipients) {
    if (r === "owner") c.ownerIds.forEach((id) => ids.add(id));
    else if (r === "manager") (await usersWithRole("DEPT_HEAD")).forEach((id) => ids.add(id));
    else if (r.startsWith("role:")) (await usersWithRole(r.slice(5))).forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** What each trigger watches. */
async function candidatesFor(rule: ReminderRule): Promise<Candidate[]> {
  const today = todayDate();
  switch (rule.trigger) {
    case "INVOICE_DUE": {
      const rows = await db.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "DISPUTED"] }, dueDate: { not: null }, type: { not: "CREDIT_NOTE" } },
        select: { id: true, number: true, dueDate: true, total: true, clientId: true, client: { select: { displayName: true } } },
      });
      const owners = await clientOwners(rows.map((r) => r.clientId));
      return rows.map((r) => {
        const overdue = r.dueDate! < today;
        return {
          entityType: "invoice",
          entityId: r.id,
          anchor: r.dueDate!,
          title: overdue ? "notif.invoiceOverdue" : "notif.invoiceDue",
          params: { number: r.number ?? "", client: r.client.displayName, date: toDateOnly(r.dueDate!) },
          href: `/billing/invoices/${r.id}`,
          severity: overdue ? "HIGH" : "MEDIUM",
          ownerIds: owners.get(r.clientId) ?? [],
        };
      });
    }
    case "DOC_EXPIRY": {
      const horizon = new Date(today.getTime() + (Math.max(0, -Math.min(...rule.offsetsDays)) + 1) * 86_400_000);
      const docs = await db.document.findMany({
        where: { archivedAt: null, expiryDate: { not: null, lte: horizon }, ownerType: { in: ["EMPLOYEE", "CLIENT"] } },
        select: { id: true, type: true, expiryDate: true, ownerType: true, ownerId: true },
      });
      const employeeIds = docs.filter((d) => d.ownerType === "EMPLOYEE").map((d) => d.ownerId);
      const [employees, allocations] = await Promise.all([
        db.employee.findMany({ where: { id: { in: employeeIds }, status: { not: "EXITED" } }, select: { id: true, nameEn: true } }),
        db.allocation.findMany({ where: { employeeId: { in: employeeIds }, ...activeOn() }, select: { employeeId: true, clientId: true } }),
      ]);
      const names = new Map(employees.map((e) => [e.id, e.nameEn]));
      const clientOf = new Map(allocations.map((a) => [a.employeeId, a.clientId]));
      const owners = await clientOwners([...clientOf.values(), ...docs.filter((d) => d.ownerType === "CLIENT").map((d) => d.ownerId)]);
      const clients = new Map((await db.client.findMany({ where: { id: { in: docs.filter((d) => d.ownerType === "CLIENT").map((d) => d.ownerId) } }, select: { id: true, displayName: true } })).map((c) => [c.id, c.displayName]));
      return docs.flatMap((d) => {
        const isEmployee = d.ownerType === "EMPLOYEE";
        if (isEmployee && !names.has(d.ownerId)) return []; // exited employees need no more reminders
        const expired = d.expiryDate! < today;
        return [{
          entityType: "document",
          entityId: d.id,
          anchor: d.expiryDate!,
          title: expired ? "notif.docExpired" : "notif.docExpiring",
          params: { doc: d.type, owner: (isEmployee ? names.get(d.ownerId) : clients.get(d.ownerId)) ?? "", date: toDateOnly(d.expiryDate!) },
          href: isEmployee ? `/employees/${d.ownerId}?tab=documents` : `/clients/${d.ownerId}?tab=documents`,
          severity: (expired ? "CRITICAL" : "HIGH") as Severity,
          ownerIds: (isEmployee ? owners.get(clientOf.get(d.ownerId) ?? "") : owners.get(d.ownerId)) ?? [],
        }];
      });
    }
    case "CONTRACT_RENEWAL": {
      const rows = await db.contract.findMany({
        where: { status: "ACTIVE", endDate: { not: null } },
        select: { id: true, number: true, endDate: true, clientId: true, client: { select: { displayName: true } } },
      });
      const owners = await clientOwners(rows.map((r) => r.clientId));
      return rows.map((r) => ({
        entityType: "contract",
        entityId: r.id,
        anchor: r.endDate!,
        title: "notif.contractRenewal",
        params: { number: r.number, client: r.client.displayName, date: toDateOnly(r.endDate!) },
        href: `/clients/${r.clientId}?tab=contracts`,
        severity: "MEDIUM" as Severity,
        ownerIds: owners.get(r.clientId) ?? [],
      }));
    }
    case "TASK_OVERDUE": {
      const rows = await db.task.findMany({
        where: { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] }, dueAt: { not: null, lt: new Date() }, archivedAt: null },
        select: { id: true, number: true, title: true, dueAt: true, ownerId: true, priority: true },
      });
      return rows.map((r) => ({
        entityType: "task",
        entityId: r.id,
        anchor: new Date(`${toDateOnly(r.dueAt!)}T00:00:00Z`),
        title: "notif.taskOverdue",
        params: { number: r.number, title: r.title },
        href: `/tasks/${r.id}`,
        severity: (r.priority === "URGENT" || r.priority === "HIGH" ? "HIGH" : "MEDIUM") as Severity,
        ownerIds: [r.ownerId],
      }));
    }
    case "CASE_SLA": {
      const rows = await db.case.findMany({
        where: { stage: { notIn: ["CLOSED"] }, slaDueAt: { not: null, lt: new Date() } },
        select: { id: true, number: true, title: true, slaDueAt: true, ownerId: true, severity: true },
      });
      return rows.map((r) => ({
        entityType: "case",
        entityId: r.id,
        anchor: new Date(`${toDateOnly(r.slaDueAt!)}T00:00:00Z`),
        title: "notif.caseSla",
        params: { number: r.number, title: r.title },
        href: `/cases/${r.id}`,
        severity: r.severity,
        ownerIds: [r.ownerId],
      }));
    }
    case "PAYABLE_DUE": {
      const rows = await db.payable.findMany({ where: { status: "OPEN" }, select: { id: true, description: true, dueDate: true } });
      return rows.map((r) => ({
        entityType: "payable",
        entityId: r.id,
        anchor: r.dueDate,
        title: r.dueDate < today ? "notif.payableOverdue" : "notif.payableDue",
        params: { description: r.description, date: toDateOnly(r.dueDate) },
        href: "/finance/payables",
        severity: (r.dueDate < today ? "CRITICAL" : "HIGH") as Severity,
        ownerIds: [],
      }));
    }
    case "ESCALATION_UPDATE": {
      const rows = await db.escalation.findMany({
        where: { status: { not: "RESOLVED" }, nextUpdateDueAt: { lt: new Date() } },
        select: { id: true, number: true, title: true, nextUpdateDueAt: true, ownerId: true, severity: true },
      });
      return rows.map((r) => ({
        entityType: "escalation",
        entityId: r.id,
        anchor: new Date(`${toDateOnly(r.nextUpdateDueAt!)}T00:00:00Z`),
        title: "notif.escalationUpdateDue",
        params: { number: r.number, title: r.title },
        href: "/escalations",
        severity: r.severity,
        ownerIds: [r.ownerId],
      }));
    }
    default:
      return [];
  }
}

async function notify(rule: ReminderRule, c: Candidate, offset: number): Promise<number> {
  let created = 0;
  for (const userId of await recipients(rule, c)) {
    const dedupeKey = `${rule.id}:${c.entityId}:${offset}:${userId}`;
    const existing = await db.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (existing) continue;
    const row = await db.notification.create({
      data: { userId, ruleId: rule.id, entityType: c.entityType, entityId: c.entityId, title: c.title, body: JSON.stringify(c.params), href: c.href, severity: c.severity, dedupeKey },
    }).catch(() => null); // another instance got there first: the unique key did its job
    if (!row) continue;
    created++;
    if (rule.channels.includes("email")) await deliverEmail(row.id, userId, c.title, c.params, c.href);
  }
  return created;
}

/** CAS-04: an overdue case escalates by itself, once, with a trail. */
async function autoEscalateBreaches(): Promise<number> {
  const breached = await db.case.findMany({
    where: { stage: { not: "CLOSED" }, slaDueAt: { lt: new Date() }, breached: false },
    select: { id: true, title: true, clientId: true, ownerId: true, severity: true, number: true },
  });
  const policies = new Map((await db.slaPolicy.findMany({ where: { scope: "escalation" } })).map((p) => [p.severity, p.updateWithinHours]));
  for (const c of breached) {
    await db.$transaction(async (tx) => {
      await tx.case.update({ where: { id: c.id }, data: { breached: true } });
      const open = await tx.escalation.count({ where: { caseId: c.id, status: { not: "RESOLVED" } } });
      if (open) return;
      const number = `ESC-${pad(await nextNumber(tx, "ESC"))}`;
      const hours = policies.get(c.severity) ?? 24;
      const row = await tx.escalation.create({
        data: { number, caseId: c.id, clientId: c.clientId, severity: c.severity, title: c.title, impactText: c.number, ownerId: c.ownerId, nextUpdateDueAt: new Date(Date.now() + hours * 3_600_000) },
      });
      await writeAudit(tx, { actorId: null, entityType: "escalation", entityId: row.id, action: "auto_escalate", after: { name: c.number } });
    });
  }
  return breached.length;
}

/** Ladder: nobody acknowledged it in time, so it goes up. */
async function escalateUnacknowledged(): Promise<number> {
  const rows = await db.notification.findMany({
    where: { status: { in: ["UNREAD", "READ"] }, escalatedAt: null, rule: { escalateAfterHours: { not: null } } },
    include: { rule: { select: { escalateAfterHours: true } } },
  });
  const heads = await usersWithRole("DEPT_HEAD");
  let count = 0;
  for (const n of rows) {
    if (Date.now() - n.createdAt.getTime() < n.rule!.escalateAfterHours! * 3_600_000) continue;
    for (const userId of heads.filter((u) => u !== n.userId)) {
      await db.notification.create({
        data: { userId, ruleId: n.ruleId, entityType: n.entityType, entityId: n.entityId, title: "notif.escalated", body: JSON.stringify({ inner: n.title, params: n.body }), href: n.href, severity: "CRITICAL", dedupeKey: `esc:${n.id}:${userId}` },
      }).catch(() => null);
    }
    await db.notification.update({ where: { id: n.id }, data: { escalatedAt: new Date() } });
    count++;
  }
  return count;
}

/** Once the underlying thing is done, its reminders close themselves. */
async function resolveFinished(): Promise<number> {
  const open = { status: { in: ACTIVE_NOTIFICATION } };
  const ids = async (where: Prisma.NotificationWhereInput) => (await db.notification.findMany({ where: { ...open, ...where }, select: { entityId: true }, distinct: ["entityId"] })).map((n) => n.entityId);
  const [inv, tsk, cas, pay, doc] = await Promise.all([ids({ entityType: "invoice" }), ids({ entityType: "task" }), ids({ entityType: "case" }), ids({ entityType: "payable" }), ids({ entityType: "document" })]);
  const done = [
    ...(await db.invoice.findMany({ where: { id: { in: inv }, status: { in: ["PAID", "VOID"] } }, select: { id: true } })),
    ...(await db.task.findMany({ where: { id: { in: tsk }, status: { in: ["DONE", "CANCELLED"] } }, select: { id: true } })),
    ...(await db.case.findMany({ where: { id: { in: cas }, stage: "CLOSED" }, select: { id: true } })),
    ...(await db.payable.findMany({ where: { id: { in: pay }, status: { not: "OPEN" } }, select: { id: true } })),
    ...(await db.document.findMany({ where: { id: { in: doc }, archivedAt: { not: null } }, select: { id: true } })),
    ...(await db.escalation.findMany({ where: { id: { in: await ids({ entityType: "escalation" }) }, status: "RESOLVED" }, select: { id: true } })),
  ].map((r) => r.id);
  const { count } = await db.notification.updateMany({ where: { ...open, entityId: { in: done } }, data: { status: "RESOLVED" } });
  return count;
}

/** Snoozes that ran out come back as unread. */
async function wakeSnoozed() {
  await db.notification.updateMany({ where: { status: "SNOOZED", snoozedUntil: { lte: new Date() } }, data: { status: "UNREAD", snoozedUntil: null } });
}

/** Health from overdue money, breached cases and thin margin. Thresholds await the client's definition (Q10). */
async function recomputeHealth() {
  const today = todayDate();
  const clients = await db.client.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "SUSPENDED"] } }, select: { id: true, health: true } });
  for (const c of clients) {
    const [overdue, breached, recent] = await Promise.all([
      db.invoice.findFirst({ where: { clientId: c.id, status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: today } }, orderBy: { dueDate: "asc" }, select: { dueDate: true } }),
      db.case.count({ where: { clientId: c.id, breached: true, stage: { not: "CLOSED" } } }),
      db.invoiceLine.aggregate({ where: { invoice: { clientId: c.id, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, issueDate: { gte: new Date(today.getTime() - 92 * 86_400_000) } } }, _sum: { amount: true, costAmount: true } }),
    ]);
    const health = clientHealth({
      maxOverdueDays: overdue?.dueDate ? daysPastDue(overdue.dueDate, today) : 0,
      breachedCases: breached,
      revenue: recent._sum.amount?.toString() ?? "0",
      cost: recent._sum.costAmount?.toString() ?? "0",
    });
    if (health !== c.health) await db.client.update({ where: { id: c.id }, data: { health } });
  }
}

export async function runReminders() {
  const today = todayDate();
  const escalatedCases = await autoEscalateBreaches();
  const rules = await db.reminderRule.findMany({ where: { active: true } });
  let created = 0;
  for (const rule of rules) {
    for (const c of await candidatesFor(rule)) {
      const offset = dueOffset(rule.offsetsDays, c.anchor, today);
      if (offset !== null) created += await notify(rule, c, offset);
    }
  }
  const [escalated, resolved] = [await escalateUnacknowledged(), await resolveFinished()];
  await wakeSnoozed();
  await recomputeHealth();
  return { created, escalated, resolved, escalatedCases, ranAt: formatDate(new Date(), "en", "dateTime") };
}
