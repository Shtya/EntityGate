import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import type { Actor } from "@/server/rbac/policy";
import { dateOnly } from "@/server/util";
import { optText, reqDate, reqId, reqText } from "@/server/validation";

const code = z.string({ error: "validation.required" }).trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, "validation.code");
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const hours = z.coerce.number({ error: "validation.number" }).int().min(1).max(10000).nullish();

export const sponsorSchema = z.object({ name: reqText(120), crNumber: optText(30), type: z.enum(["OWN", "THIRD_PARTY"], { error: "validation.required" }) });
export const regionSchema = z.object({ code, name: reqText(80) });
export const locationSchema = z.object({ name: reqText(120), city: optText(80), regionId: reqId });
export const caseCategorySchema = z.object({ code, name: reqText(120), defaultSeverity: z.enum(SEVERITIES, { error: "validation.required" }), slaHours: hours, firstResponseHours: hours, active: z.boolean().default(true) });
export const expenseCategorySchema = z.object({ code, name: reqText(120), kind: z.enum(["DIRECT", "OVERHEAD"], { error: "validation.required" }), recoverableDefault: z.boolean().default(false), active: z.boolean().default(true) });
export const holidaySchema = z.object({ date: reqDate, name: reqText(120) });

/** Lists people choose from everywhere else. Stored as data, so they change without a release. */
export async function masterData() {
  const [sponsors, regions, locations, caseCategories, expenseCategories, holidays] = await Promise.all([
    db.sponsor.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } }),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.location.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, include: { region: { select: { name: true } } } }),
    db.caseCategory.findMany({ orderBy: { name: "asc" } }),
    db.expenseCategory.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.holiday.findMany({ orderBy: { date: "desc" }, take: 100 }),
  ]);
  return { sponsors, regions, locations, caseCategories, expenseCategories, holidays };
}

type Audit = { actor: Actor; entity: string; id: string; action: string; after?: Record<string, unknown> };
const audited = async <R extends { id: string }>(meta: Omit<Audit, "id">, write: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<R>) =>
  db.$transaction(async (tx) => {
    const row = await write(tx);
    await writeAudit(tx, { actorId: meta.actor.id, entityType: meta.entity, entityId: row.id, action: meta.action, after: meta.after });
    return { id: row.id };
  });

export const createSponsor = (actor: Actor, input: z.infer<typeof sponsorSchema>) => audited({ actor, entity: "sponsor", action: "create", after: { name: input.name } }, (tx) => tx.sponsor.create({ data: input }));
export const updateSponsor = (actor: Actor, id: string, input: z.infer<typeof sponsorSchema>) => audited({ actor, entity: "sponsor", action: "update", after: { name: input.name } }, (tx) => tx.sponsor.update({ where: { id }, data: input }));

export const createRegion = (actor: Actor, input: z.infer<typeof regionSchema>) => audited({ actor, entity: "region", action: "create", after: { name: input.name } }, (tx) => tx.region.create({ data: input }));
export const createLocation = (actor: Actor, input: z.infer<typeof locationSchema>) => audited({ actor, entity: "location", action: "create", after: { name: input.name } }, (tx) => tx.location.create({ data: input }));
export const archiveLocation = (actor: Actor, id: string) => audited({ actor, entity: "location", action: "archive" }, (tx) => tx.location.update({ where: { id }, data: { archivedAt: new Date() } }));

export const createCaseCategory = (actor: Actor, input: z.infer<typeof caseCategorySchema>) => audited({ actor, entity: "case_category", action: "create", after: { name: input.name } }, (tx) => tx.caseCategory.create({ data: input }));
export const updateCaseCategory = (actor: Actor, id: string, input: z.infer<typeof caseCategorySchema>) => audited({ actor, entity: "case_category", action: "update", after: { name: input.name, slaHours: input.slaHours, active: input.active } }, (tx) => tx.caseCategory.update({ where: { id }, data: input }));

export const createExpenseCategory = (actor: Actor, input: z.infer<typeof expenseCategorySchema>) => audited({ actor, entity: "expense_category", action: "create", after: { name: input.name } }, (tx) => tx.expenseCategory.create({ data: input }));
/** The type stays fixed once created: changing it would move past expenses in and out of overhead. */
export const updateExpenseCategory = async (actor: Actor, id: string, input: z.infer<typeof expenseCategorySchema>) => {
  const row = await db.expenseCategory.findUnique({ where: { id } });
  if (!row) throw notFound();
  if (row.kind !== input.kind && (await db.expense.count({ where: { categoryId: id } }))) throw conflict("errors.categoryKindLocked");
  return audited({ actor, entity: "expense_category", action: "update", after: { name: input.name, active: input.active } }, (tx) => tx.expenseCategory.update({ where: { id }, data: input }));
};

export const createHoliday = (actor: Actor, input: z.infer<typeof holidaySchema>) => audited({ actor, entity: "holiday", action: "create", after: { name: input.name, date: input.date } }, (tx) => tx.holiday.create({ data: { date: dateOnly(input.date), name: input.name } }));
export const deleteHoliday = (actor: Actor, id: string) => audited({ actor, entity: "holiday", action: "delete" }, (tx) => tx.holiday.delete({ where: { id } }));
