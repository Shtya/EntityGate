import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/rbac/policy";
import { reqText } from "@/server/validation";

export const categorySchema = z.object({ name: reqText(120) });

const OPEN = ["TODO", "IN_PROGRESS", "BLOCKED", "WAITING_FINANCE"] as const;

/** Cards for the categories page: each with how many tasks use it, open and in total. */
export async function listCategories() {
  const [rows, open] = await Promise.all([
    db.taskCategory.findMany({ orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { tasks: true } } } }),
    db.taskCategoryLink.groupBy({ by: ["categoryId"], where: { task: { archivedAt: null, status: { in: [...OPEN] } } }, _count: true }),
  ]);
  const openBy = new Map(open.map((o) => [o.categoryId, o._count]));
  return rows.map((c) => ({ id: c.id, name: c.name, archived: c.archivedAt !== null, total: c._count.tasks, open: openBy.get(c.id) ?? 0 }));
}

/** For the task form: active categories only. */
export async function categoryChoices() {
  return db.taskCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

async function assertUniqueName(name: string, exceptId?: string) {
  const clash = await db.taskCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw invalid("errors.validation", [{ path: "name", message: "taskCategories.duplicate" }]);
}

export async function createCategory(actor: Actor, input: z.infer<typeof categorySchema>) {
  await assertUniqueName(input.name);
  return db.$transaction(async (tx) => {
    const last = await tx.taskCategory.aggregate({ _max: { sortOrder: true } });
    const row = await tx.taskCategory.create({ data: { name: input.name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
    await writeAudit(tx, { actorId: actor.id, entityType: "task_category", entityId: row.id, action: "create", after: { name: input.name } });
    return { id: row.id };
  });
}

/** Renaming changes the label everywhere, including on existing tasks. Task titles already written stay as they are. */
export async function renameCategory(actor: Actor, id: string, input: z.infer<typeof categorySchema>) {
  const row = await db.taskCategory.findUnique({ where: { id } });
  if (!row) throw notFound();
  await assertUniqueName(input.name, id);
  await db.$transaction(async (tx) => {
    await tx.taskCategory.update({ where: { id }, data: { name: input.name } });
    await writeAudit(tx, { actorId: actor.id, entityType: "task_category", entityId: id, action: "update", before: { name: row.name }, after: { name: input.name } });
  });
  return { id };
}

/**
 * Removes a category. Unused ones are deleted; ones that tasks already carry are archived instead,
 * so those tasks keep their label while the category stops appearing on new tasks.
 */
export async function removeCategory(actor: Actor, id: string) {
  const row = await db.taskCategory.findUnique({ where: { id }, include: { _count: { select: { tasks: true } } } });
  if (!row) throw notFound();
  const used = row._count.tasks;
  await db.$transaction(async (tx) => {
    if (used) await tx.taskCategory.update({ where: { id }, data: { archivedAt: new Date() } });
    else await tx.taskCategory.delete({ where: { id } });
    await writeAudit(tx, { actorId: actor.id, entityType: "task_category", entityId: id, action: used ? "archive" : "delete", after: { name: row.name, tasks: used } });
  });
  return { id, archived: used > 0, tasks: used };
}

export async function restoreCategory(actor: Actor, id: string) {
  const row = await db.taskCategory.findUnique({ where: { id } });
  if (!row) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.taskCategory.update({ where: { id }, data: { archivedAt: null } });
    await writeAudit(tx, { actorId: actor.id, entityType: "task_category", entityId: id, action: "restore", after: { name: row.name } });
  });
  return { id };
}
