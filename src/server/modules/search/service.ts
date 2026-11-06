import "server-only";
import { db } from "@/server/db";
import { getClientScope } from "@/server/rbac/actor";
import { can, clientRowFilter, type Actor } from "@/server/rbac/policy";
import { employeeScope } from "@/server/modules/employees/service";

export interface SearchHit {
  type: "client" | "employee" | "invoice" | "case" | "task";
  id: string;
  title: string;
  sub: string | null;
  href: string;
}

const TAKE = 5;

/** GEN-01. Only returns what this person could open anyway, and never searches encrypted IDs. */
export async function globalSearch(actor: Actor, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const scope = await getClientScope();
  const work = scope.kind === "all" ? {} : { OR: [{ ownerId: actor.id }, { clientId: { in: scope.clientIds } }] };
  const money = scope.kind === "all" ? {} : { clientId: { in: scope.clientIds } };

  const [clients, employees, invoices, cases, tasks] = await Promise.all([
    can(actor, "client:read") ? db.client.findMany({ where: { archivedAt: null, ...clientRowFilter(scope), OR: [{ displayName: has }, { legalName: has }, { code: has }] }, take: TAKE, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, code: true } }) : [],
    can(actor, "employee:read") ? db.employee.findMany({ where: { archivedAt: null, ...employeeScope(scope), OR: [{ nameEn: has }, { nameAr: has }, { employeeNo: has }] }, take: TAKE, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, employeeNo: true } }) : [],
    can(actor, "invoice:read") ? db.invoice.findMany({ where: { ...money, OR: [{ number: has }, { poNumber: has }] }, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, number: true, client: { select: { displayName: true } } } }) : [],
    can(actor, "case:read") ? db.case.findMany({ where: { ...work, AND: [{ OR: [{ number: has }, { title: has }] }] }, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true } }) : [],
    can(actor, "task:read") ? db.task.findMany({ where: { archivedAt: null, ...work, AND: [{ OR: [{ number: has }, { title: has }] }] }, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true } }) : [],
  ]);
  return [
    ...clients.map((c): SearchHit => ({ type: "client", id: c.id, title: c.displayName, sub: c.code, href: `/clients/${c.id}` })),
    ...employees.map((e): SearchHit => ({ type: "employee", id: e.id, title: e.nameEn, sub: e.employeeNo, href: `/employees/${e.id}` })),
    ...invoices.map((i): SearchHit => ({ type: "invoice", id: i.id, title: i.number ?? "—", sub: i.client.displayName, href: `/billing/invoices/${i.id}` })),
    ...cases.map((c): SearchHit => ({ type: "case", id: c.id, title: c.title, sub: c.number, href: `/cases/${c.id}` })),
    ...tasks.map((x): SearchHit => ({ type: "task", id: x.id, title: x.title, sub: x.number, href: `/tasks/${x.id}` })),
  ];
}
