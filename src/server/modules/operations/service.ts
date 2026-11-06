import "server-only";
import type { CaseStage, Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { forbidden, invalid, notFound } from "@/server/errors";
import { can, inScope, type Actor } from "@/server/rbac/policy";
import { getClientScope } from "@/server/rbac/actor";
import { dateOrNull, nextNumber, pad } from "@/server/util";
import { PAGE_SIZE } from "@/server/validation";
import { addWorkingHours, todayDate } from "@/lib/dates";
import { assertEmployeeAccess } from "@/server/modules/employees/service";
import type { CaseInput, closeCaseSchema, commentSchema, EscalationInput, ListCasesQuery, ListTasksQuery, TaskInput } from "./schema";

type Comment = z.infer<typeof commentSchema>;

async function assertLinks(input: { clientId?: string | null; employeeId?: string | null }) {
  const scope = await getClientScope();
  if (input.clientId && !inScope(scope, input.clientId)) throw forbidden();
  if (input.employeeId) await assertEmployeeAccess(input.employeeId, scope);
}

async function activeOwner(ownerId: string) {
  const owner = await db.user.findFirst({ where: { id: ownerId, status: "ACTIVE" }, select: { id: true } });
  if (!owner) throw invalid("errors.validation", [{ path: "ownerId", message: "errors.userNotFound" }]);
}

/** Everyone who can see a record through scope, plus the people named on it. */
async function visibility(actor: Actor, extra: Prisma.InputJsonValue | object = {}) {
  const scope = await getClientScope();
  if (scope.kind === "all") return extra;
  return { AND: [extra, { OR: [{ ownerId: actor.id }, { clientId: { in: scope.clientIds } }] }] };
}

const OPEN_TASK = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

// ─────────────────────────── Tasks ───────────────────────────

/** TSK-03: "team" and "all" are widened views, so they need task:read_all. */
export async function listTasks(actor: Actor, q: ListTasksQuery) {
  const wide = can(actor, "task:read_all");
  const view = !wide && (q.view === "team" || q.view === "all") ? "mine" : q.view;
  const base: Prisma.TaskWhereInput = {
    archivedAt: null,
    status: q.status,
    clientId: q.client || undefined,
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { number: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(view === "mine" ? { ownerId: actor.id } : {}),
    ...(view === "team" ? { status: q.status ?? { in: [...OPEN_TASK] } } : {}),
    ...(view === "overdue" ? { status: { in: [...OPEN_TASK] }, dueAt: { lt: new Date() } } : {}),
    ...(view === "mine" && !q.status ? { status: { in: [...OPEN_TASK] } } : {}),
  };
  const where = (wide ? base : await visibility(actor, base)) as Prisma.TaskWhereInput;
  const take = q.layout === "board" ? 200 : PAGE_SIZE;
  const [rows, total] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: q.layout === "board" ? 0 : (q.page - 1) * PAGE_SIZE,
      take,
      include: { client: { select: { id: true, displayName: true } }, owner: { select: { id: true, name: true } } },
    }),
    db.task.count({ where }),
  ]);
  return { rows, total, page: q.page, view };
}

export async function createTask(actor: Actor, input: TaskInput) {
  await assertLinks(input);
  await activeOwner(input.ownerId);
  return db.$transaction(async (tx) => {
    const number = `TSK-${pad(await nextNumber(tx, "TSK"))}`;
    const task = await tx.task.create({
      data: {
        number,
        title: input.title,
        description: input.description,
        kind: input.clientId || input.employeeId ? "CLIENT" : "INTERNAL",
        clientId: input.clientId,
        employeeId: input.employeeId,
        caseId: input.caseId,
        ownerId: input.ownerId,
        createdById: actor.id,
        dueAt: dateOrNull(input.dueAt),
        priority: input.priority,
        recurrenceRule: input.recurrence && input.recurrence !== "NONE" ? input.recurrence : null,
      },
    });
    if (input.ownerId !== actor.id) {
      await tx.notification.create({
        data: { userId: input.ownerId, entityType: "task", entityId: task.id, title: "notif.taskAssigned", body: JSON.stringify({ number, title: input.title }), href: `/tasks/${task.id}`, severity: input.priority === "URGENT" ? "HIGH" : "MEDIUM", dedupeKey: `task-assigned:${task.id}:${input.ownerId}` },
      });
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "task", entityId: task.id, action: "create", after: { name: number, ownerId: input.ownerId } });
    return { id: task.id };
  });
}

async function loadTask(actor: Actor, id: string) {
  const task = await db.task.findFirst({ where: { id, archivedAt: null } });
  if (!task) throw notFound();
  if (task.ownerId === actor.id || task.createdById === actor.id || can(actor, "task:read_all")) return task;
  if (!inScope(await getClientScope(), task.clientId)) throw forbidden();
  return task;
}

export async function getTask(actor: Actor, id: string) {
  await loadTask(actor, id);
  return db.task.findUniqueOrThrow({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true } },
      employee: { select: { id: true, nameEn: true, nameAr: true } },
      case: { select: { id: true, number: true } },
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } }, attachment: { select: { id: true, filename: true } } } },
    },
  });
}

/** Completing a recurring task schedules the next one, so routine work can't quietly drop off. */
function nextDue(from: Date, rule: string): Date {
  const d = new Date(from);
  if (rule === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  if (rule === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export async function setTaskStatus(actor: Actor, id: string, status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED") {
  const task = await loadTask(actor, id);
  return db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
    if (status === "DONE" && task.status !== "DONE" && task.recurrenceRule) {
      const number = `TSK-${pad(await nextNumber(tx, "TSK"))}`;
      await tx.task.create({
        data: {
          number,
          title: task.title,
          description: task.description,
          kind: task.kind,
          clientId: task.clientId,
          employeeId: task.employeeId,
          ownerId: task.ownerId,
          createdById: task.createdById,
          priority: task.priority,
          recurrenceRule: task.recurrenceRule,
          dueAt: nextDue(task.dueAt ?? todayDate(), task.recurrenceRule),
        },
      });
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "task", entityId: id, action: "status_change", before: { status: task.status }, after: { status } });
    return { id };
  });
}

export async function reassignTask(actor: Actor, id: string, ownerId: string) {
  const task = await loadTask(actor, id);
  await activeOwner(ownerId);
  return db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { ownerId } });
    await tx.notification.create({
      data: { userId: ownerId, entityType: "task", entityId: id, title: "notif.taskAssigned", body: JSON.stringify({ number: task.number, title: task.title }), href: `/tasks/${id}`, severity: "MEDIUM", dedupeKey: `task-assigned:${id}:${ownerId}:${Date.now()}` },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "task", entityId: id, action: "reassign", before: { ownerId: task.ownerId }, after: { ownerId } });
    return { id };
  });
}

export async function commentOnTask(actor: Actor, id: string, input: Comment) {
  await loadTask(actor, id);
  const row = await db.taskComment.create({ data: { taskId: id, authorId: actor.id, body: input.body, attachmentId: input.attachmentId } });
  return { id: row.id };
}

// ─────────────────────────── Cases ───────────────────────────

const OPEN_CASE: Prisma.CaseWhereInput = { stage: { not: "CLOSED" } };

export async function listCases(actor: Actor, q: ListCasesQuery) {
  const base: Prisma.CaseWhereInput = {
    stage: q.stage,
    clientId: q.client || undefined,
    categoryId: q.category || undefined,
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { number: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.view === "open" && !q.stage ? OPEN_CASE : {}),
    ...(q.view === "overdue" ? { ...OPEN_CASE, slaDueAt: { lt: new Date() } } : {}),
    ...(q.view === "mine" ? { ownerId: actor.id, ...OPEN_CASE } : {}),
  };
  const where = (await visibility(actor, base)) as Prisma.CaseWhereInput;
  const [rows, total, counts] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ slaDueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { code: true, name: true } },
        client: { select: { id: true, displayName: true } },
        employee: { select: { id: true, nameEn: true, nameAr: true } },
        owner: { select: { name: true } },
      },
    }),
    db.case.count({ where }),
    caseCounts(actor),
  ]);
  return { rows, total, page: q.page, counts };
}

export async function caseCounts(actor: Actor) {
  const open = (await visibility(actor, OPEN_CASE)) as Prisma.CaseWhereInput;
  const today = todayDate();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const [total, overdue, dueToday] = await Promise.all([
    db.case.count({ where: open }),
    db.case.count({ where: { AND: [open, { slaDueAt: { lt: new Date() } }] } }),
    db.case.count({ where: { AND: [open, { slaDueAt: { gte: new Date(), lt: tomorrow } }] } }),
  ]);
  return { total, overdue, dueToday };
}

export async function createCase(actor: Actor, input: CaseInput) {
  if (!input.clientId && !input.employeeId) throw invalid("errors.validation", [{ path: "clientId", message: "validation.caseNeedsLink" }]);
  await assertLinks(input);
  await activeOwner(input.ownerId);
  const category = await db.caseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw invalid("errors.validation", [{ path: "categoryId", message: "validation.required" }]);
  return db.$transaction(async (tx) => {
    const number = `CS-${pad(await nextNumber(tx, "CS"))}`;
    const row = await tx.case.create({
      data: {
        number,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        clientId: input.clientId,
        employeeId: input.employeeId,
        source: input.source ?? "INTERNAL",
        severity: input.severity ?? category.defaultSeverity,
        ownerId: input.ownerId,
        slaDueAt: category.slaHours ? new Date(Date.now() + category.slaHours * 3_600_000) : null,
        events: { create: { toStage: "RECEIVED", actorId: actor.id } },
      },
    });
    if (input.ownerId !== actor.id) {
      await tx.notification.create({
        data: { userId: input.ownerId, entityType: "case", entityId: row.id, title: "notif.caseAssigned", body: JSON.stringify({ number, title: input.title }), href: `/cases/${row.id}`, severity: row.severity, dedupeKey: `case-assigned:${row.id}:${input.ownerId}` },
      });
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "case", entityId: row.id, action: "create", after: { name: number } });
    return { id: row.id };
  });
}

async function loadCase(actor: Actor, id: string) {
  const row = await db.case.findUnique({ where: { id } });
  if (!row) throw notFound();
  if (row.ownerId === actor.id) return row;
  const scope = await getClientScope();
  if (scope.kind === "all" || inScope(scope, row.clientId)) return row;
  throw forbidden();
}

export async function getCase(actor: Actor, id: string) {
  await loadCase(actor, id);
  return db.case.findUniqueOrThrow({
    where: { id },
    include: {
      category: true,
      client: { select: { id: true, displayName: true } },
      employee: { select: { id: true, nameEn: true, nameAr: true } },
      owner: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } }, attachment: { select: { id: true, filename: true } } } },
      escalations: { orderBy: { raisedAt: "desc" }, select: { id: true, number: true, status: true, severity: true } },
      tasks: { where: { archivedAt: null }, select: { id: true, number: true, title: true, status: true } },
    },
  });
}

export async function moveCase(actor: Actor, id: string, stage: CaseStage, note?: string | null) {
  const row = await loadCase(actor, id);
  // Closing and reopening have their own rules below; they can't be reached through a plain move.
  if (stage === "CLOSED" || stage === "REOPENED" || row.stage === "CLOSED") throw invalid("errors.badTransition");
  if (stage === row.stage) return { id };
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { stage, firstResponseAt: row.firstResponseAt ?? new Date() } });
    await tx.caseEvent.create({ data: { caseId: id, fromStage: row.stage, toStage: stage, actorId: actor.id, note } });
    await writeAudit(tx, { actorId: actor.id, entityType: "case", entityId: id, action: "stage_change", before: { stage: row.stage }, after: { stage } });
  });
  return { id };
}

/** CAS-05: closing needs the case:close permission and a resolution note. */
export async function closeCase(actor: Actor, id: string, input: z.infer<typeof closeCaseSchema>) {
  const row = await loadCase(actor, id);
  if (row.stage === "CLOSED") throw invalid("errors.badTransition");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { stage: "CLOSED", closedAt: now, resolvedAt: row.resolvedAt ?? now, resolutionNote: input.resolutionNote, firstResponseAt: row.firstResponseAt ?? now } });
    await tx.caseEvent.create({ data: { caseId: id, fromStage: row.stage, toStage: "CLOSED", actorId: actor.id, note: input.resolutionNote } });
    if (input.attachmentId) await tx.caseComment.create({ data: { caseId: id, authorId: actor.id, body: input.resolutionNote, attachmentId: input.attachmentId } });
    await tx.escalation.updateMany({ where: { caseId: id, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: now } });
    await writeAudit(tx, { actorId: actor.id, entityType: "case", entityId: id, action: "close", before: { stage: row.stage }, after: { stage: "CLOSED" } });
  });
  return { id };
}

/** BR-04: reopening needs a reason, and every earlier event stays in the history. */
export async function reopenCase(actor: Actor, id: string, reason: string) {
  const row = await loadCase(actor, id);
  if (row.stage !== "CLOSED") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { stage: "REOPENED", closedAt: null, resolvedAt: null, breached: false } });
    await tx.caseEvent.create({ data: { caseId: id, fromStage: "CLOSED", toStage: "REOPENED", actorId: actor.id, note: reason } });
    await writeAudit(tx, { actorId: actor.id, entityType: "case", entityId: id, action: "reopen", after: { reason } });
  });
  return { id };
}

export async function reassignCase(actor: Actor, id: string, ownerId: string) {
  const row = await loadCase(actor, id);
  await activeOwner(ownerId);
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { ownerId } });
    await writeAudit(tx, { actorId: actor.id, entityType: "case", entityId: id, action: "reassign", before: { ownerId: row.ownerId }, after: { ownerId } });
    await tx.notification.create({
      data: { userId: ownerId, entityType: "case", entityId: id, title: "notif.caseAssigned", body: JSON.stringify({ number: row.number, title: row.title }), href: `/cases/${id}`, severity: row.severity, dedupeKey: `case-assigned:${id}:${ownerId}:${Date.now()}` },
    });
  });
  return { id };
}

export async function commentOnCase(actor: Actor, id: string, input: Comment) {
  const row = await loadCase(actor, id);
  const created = await db.$transaction(async (tx) => {
    if (!row.firstResponseAt) await tx.case.update({ where: { id }, data: { firstResponseAt: new Date() } });
    return tx.caseComment.create({ data: { caseId: id, authorId: actor.id, body: input.body, attachmentId: input.attachmentId } });
  });
  return { id: created.id };
}

export async function categoryOptions() {
  return db.caseCategory.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
}

// ─────────────────────────── Escalations ───────────────────────────

/** When the next management update is owed, per the SLA policy for this severity. */
async function nextUpdateDue(severity: EscalationInput["severity"], from = new Date()) {
  const policy = await db.slaPolicy.findUnique({ where: { scope_severity: { scope: "escalation", severity } } });
  if (!policy) return null;
  if (!policy.businessHoursOnly) return new Date(from.getTime() + policy.updateWithinHours * 3_600_000);
  const holidays = await db.holiday.findMany({ select: { date: true } });
  return addWorkingHours(from, policy.updateWithinHours, holidays.map((h) => h.date));
}

export async function listEscalations(status: "active" | "resolved", actor: Actor) {
  const where = (await visibility(actor, status === "active" ? { status: { not: "RESOLVED" } } : { status: "RESOLVED" })) as Prisma.EscalationWhereInput;
  const rows = await db.escalation.findMany({
    where,
    orderBy: status === "active" ? [{ severity: "asc" }, { raisedAt: "asc" }] : [{ resolvedAt: "desc" }],
    take: 100,
    include: {
      client: { select: { id: true, displayName: true } },
      case: { select: { id: true, number: true } },
      owner: { select: { name: true } },
      updates: { orderBy: { createdAt: "desc" }, take: 3, include: { author: { select: { name: true } } } },
    },
  });
  return rows;
}

export async function raiseEscalation(actor: Actor, input: EscalationInput) {
  await assertLinks(input);
  await activeOwner(input.ownerId);
  const due = await nextUpdateDue(input.severity);
  return db.$transaction(async (tx) => {
    const number = `ESC-${pad(await nextNumber(tx, "ESC"))}`;
    const row = await tx.escalation.create({ data: { ...input, number, raisedById: actor.id, nextUpdateDueAt: due } });
    await writeAudit(tx, { actorId: actor.id, entityType: "escalation", entityId: row.id, action: "create", after: { name: number, severity: input.severity } });
    const heads = await tx.userRole.findMany({ where: { role: { key: "DEPT_HEAD" }, user: { status: "ACTIVE" } }, select: { userId: true } });
    for (const userId of new Set([input.ownerId, ...heads.map((h) => h.userId)])) {
      await tx.notification.create({
        data: { userId, entityType: "escalation", entityId: row.id, title: "notif.escalationRaised", body: JSON.stringify({ number, title: input.title }), href: "/escalations", severity: input.severity, dedupeKey: `esc-raised:${row.id}:${userId}` },
      });
    }
    return { id: row.id };
  });
}

async function loadEscalation(actor: Actor, id: string) {
  const row = await db.escalation.findUnique({ where: { id } });
  if (!row) throw notFound();
  if (row.ownerId === actor.id) return row;
  const scope = await getClientScope();
  if (scope.kind === "all" || inScope(scope, row.clientId)) return row;
  throw forbidden();
}

/** Each update restarts the clock for the next one, and acknowledges the issue. */
export async function updateEscalation(actor: Actor, id: string, note: string) {
  const row = await loadEscalation(actor, id);
  if (row.status === "RESOLVED") throw invalid("errors.badTransition");
  const due = await nextUpdateDue(row.severity);
  await db.$transaction(async (tx) => {
    await tx.escalationUpdate.create({ data: { escalationId: id, authorId: actor.id, note } });
    await tx.escalation.update({ where: { id }, data: { status: "ACKNOWLEDGED", nextUpdateDueAt: due } });
    await writeAudit(tx, { actorId: actor.id, entityType: "escalation", entityId: id, action: "update", after: { note } });
  });
  return { id };
}

export async function resolveEscalation(actor: Actor, id: string, note: string) {
  const row = await loadEscalation(actor, id);
  if (row.status === "RESOLVED") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.escalationUpdate.create({ data: { escalationId: id, authorId: actor.id, note } });
    await tx.escalation.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), nextUpdateDueAt: null } });
    await writeAudit(tx, { actorId: actor.id, entityType: "escalation", entityId: id, action: "resolve", after: { note } });
  });
  return { id };
}
