import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import type { Actor } from "@/server/rbac/policy";
import { optText, pageQuery, PAGE_SIZE, reqMoney, reqText } from "@/server/validation";

export const SERVICE_UNITS = ["PER_REQUEST", "PER_EMPLOYEE", "PER_MONTH", "PER_YEAR"] as const;

const code = z.string({ error: "validation.required" }).trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, "validation.code");

export const serviceSchema = z.object({
  code,
  nameEn: reqText(150),
  nameAr: optText(150),
  unit: z.enum(SERVICE_UNITS, { error: "validation.required" }),
  price: reqMoney,
  notes: optText(500),
  active: z.boolean().default(true),
});
export type ServiceInput = z.infer<typeof serviceSchema>;

export const listServicesQuery = z.object({
  ...pageQuery,
  status: z.enum(["active", "inactive", "all"]).catch("active").default("active"),
});
export type ListServicesQuery = z.infer<typeof listServicesQuery>;

/** What the company charges for each service. Prices are before VAT; the client's contract sets VAT. */
export async function listServices(q: ListServicesQuery) {
  const where: Prisma.ServicePriceWhereInput = {
    ...(q.status === "all" ? {} : { active: q.status === "active" }),
    ...(q.q ? { OR: [{ nameEn: { contains: q.q, mode: "insensitive" } }, { nameAr: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.servicePrice.findMany({ where, orderBy: [{ active: "desc" }, { nameEn: "asc" }], skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.servicePrice.count({ where }),
  ]);
  return { rows, total, page: q.page };
}

/** For pickers: active services, named in the reader's language. */
export async function serviceOptions(locale: string) {
  const rows = await db.servicePrice.findMany({ where: { active: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true, price: true } });
  return rows.map((s) => ({ value: s.id, label: `${(locale === "ar" && s.nameAr) || s.nameEn} · ${s.price.toFixed(2)}` }));
}

export async function getService(id: string) {
  const row = await db.servicePrice.findUnique({ where: { id } });
  if (!row) throw notFound();
  return row;
}

export async function createService(actor: Actor, input: ServiceInput) {
  return db.$transaction(async (tx) => {
    const row = await tx.servicePrice.create({ data: input });
    await writeAudit(tx, { actorId: actor.id, entityType: "service_price", entityId: row.id, action: "create", after: { name: input.nameEn, price: input.price } });
    return { id: row.id };
  });
}

/** Price changes apply to new invoices only; issued invoices keep the amount they were issued with. */
export async function updateService(actor: Actor, id: string, input: ServiceInput) {
  const before = await getService(id);
  return db.$transaction(async (tx) => {
    await tx.servicePrice.update({ where: { id }, data: input });
    await writeAudit(tx, { actorId: actor.id, entityType: "service_price", entityId: id, action: "update", before: { price: before.price.toFixed(2), active: before.active }, after: { name: input.nameEn, price: input.price, active: input.active } });
    return { id };
  });
}
