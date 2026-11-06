import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { getClientScope } from "@/server/rbac/actor";
import type { PermissionKey } from "@/server/rbac/catalog";
import type { Actor } from "@/server/rbac/policy";
import { period } from "@/server/validation";
import { outstandingOf, receivables } from "@/server/modules/billing/service";
import { employeeScope } from "@/server/modules/employees/service";
import { pnl, recentPeriods } from "@/server/modules/finance/service";
import { periodBounds, todayDate } from "@/lib/dates";
import { agingSummary, daysPastDue } from "@/lib/finance";
import { add } from "@/lib/money";

export const reportQuery = z.object({
  from: period.optional().catch(undefined),
  to: period.optional().catch(undefined),
  client: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});
export type ReportQuery = z.infer<typeof reportQuery>;

export type ReportValue = string | number | Date | null;
export type ReportRow = Record<string, ReportValue>;
export interface ReportColumn {
  key: string;
  /** Message key for the heading. */
  label: string;
  type?: "text" | "money" | "int" | "date" | "percent";
  /** Message namespace that translates the value, for example enums.CaseStage. */
  enumNs?: string;
}
export interface ReportDef {
  key: string;
  permission: PermissionKey;
  /** The report uses the month range filter. */
  usesPeriod: boolean;
  columns: ReportColumn[];
  run: (actor: Actor, range: { from: string; to: string; client?: string; start: Date; end: Date }) => Promise<ReportRow[]>;
}

const CLIENT: ReportColumn = { key: "client", label: "employees.client" };
const money = (key: string, label: string): ReportColumn => ({ key, label, type: "money" });

async function clientFilter(client?: string) {
  const scope = await getClientScope();
  if (scope.kind === "all") return client ? { clientId: client } : {};
  return { clientId: { in: client ? scope.clientIds.filter((c) => c === client) : scope.clientIds } };
}

export const REPORTS: ReportDef[] = [
  {
    key: "client-issues",
    permission: "client:read",
    usesPeriod: false,
    columns: [CLIENT, { key: "health", label: "clients.health", enumNs: "enums.ClientHealth" }, money("overdue", "billing.overdue"), { key: "lateDays", label: "reports.maxLate", type: "int" }, { key: "openCases", label: "reports.openCases", type: "int" }, { key: "breached", label: "reports.breachedCases", type: "int" }, { key: "escalations", label: "reports.openEscalations", type: "int" }],
    run: async (_actor, { client }) => {
      const filter = await clientFilter(client);
      const scopeIds = "clientId" in filter ? (typeof filter.clientId === "string" ? [filter.clientId] : filter.clientId?.in) : undefined;
      const today = todayDate();
      const now = new Date();
      const [clients, money, cases, breached, escalations] = await Promise.all([
        db.client.findMany({ where: { archivedAt: null, status: { not: "EXITED" }, ...(scopeIds ? { id: { in: scopeIds } } : {}) }, select: { id: true, displayName: true, health: true } }),
        receivables(scopeIds),
        db.case.groupBy({ by: ["clientId"], where: { ...filter, closedAt: null, resolvedAt: null }, _count: true }),
        db.case.groupBy({ by: ["clientId"], where: { ...filter, closedAt: null, resolvedAt: null, slaDueAt: { lt: now } }, _count: true }),
        db.escalation.groupBy({ by: ["clientId"], where: { ...filter, status: { not: "RESOLVED" } }, _count: true }),
      ]);
      const countOf = (rows: { clientId: string | null; _count: number }[], id: string) => rows.find((r) => r.clientId === id)?._count ?? 0;
      return clients
        .map((c) => {
          const late = money.rows.filter((r) => r.client.id === c.id && r.dueDate < today);
          return {
            client: c.displayName,
            health: c.health,
            overdue: add(...late.map((r) => r.outstanding)).toFixed(2),
            lateDays: late.reduce((a, r) => Math.max(a, daysPastDue(r.dueDate, today)), 0),
            openCases: countOf(cases, c.id),
            breached: countOf(breached, c.id),
            escalations: countOf(escalations, c.id),
          };
        })
        .filter((r) => Number(r.overdue) > 0 || r.breached > 0 || r.escalations > 0 || r.health === "AT_RISK" || r.health === "WATCH")
        .sort((a, b) => b.lateDays - a.lateDays || b.escalations - a.escalations);
    },
  },
  {
    key: "pnl-clients",
    permission: "finance:read",
    usesPeriod: true,
    columns: [CLIENT, money("revenue", "finance.revenue"), money("cost", "finance.directCost"), money("contribution", "finance.contribution"), { key: "margin", label: "finance.margin", type: "percent" }],
    run: async (_actor, { from, to, client }) => {
      const data = await pnl(from, to, client ? [client] : undefined);
      return data.clients.map((r) => ({ client: r.name, revenue: r.pnl.revenue.toFixed(2), cost: r.pnl.directCost.toFixed(2), contribution: r.pnl.contribution.toFixed(2), margin: r.pnl.contributionMargin?.toNumber() ?? null }));
    },
  },
  {
    key: "aging",
    permission: "invoice:read",
    usesPeriod: false,
    columns: [CLIENT, money("CURRENT", "billing.aging_CURRENT"), money("D1_30", "billing.aging_D1_30"), money("D31_60", "billing.aging_D31_60"), money("D60_PLUS", "billing.aging_D60_PLUS"), money("total", "billing.outstanding")],
    run: async (_actor, { client }) => {
      const data = await receivables(client ? [client] : undefined);
      const today = todayDate();
      const byClient = new Map<string, typeof data.rows>();
      for (const r of data.rows) byClient.set(r.client.displayName, [...(byClient.get(r.client.displayName) ?? []), r]);
      return [...byClient].map(([name, rows]) => {
        const a = agingSummary(rows, today);
        return { client: name, CURRENT: a.CURRENT.toFixed(2), D1_30: a.D1_30.toFixed(2), D31_60: a.D31_60.toFixed(2), D60_PLUS: a.D60_PLUS.toFixed(2), total: add(...rows.map((r) => r.outstanding)).toFixed(2) };
      }).sort((x, y) => Number(y.total) - Number(x.total));
    },
  },
  {
    key: "invoices",
    permission: "invoice:read",
    usesPeriod: true,
    columns: [{ key: "number", label: "billing.invoice" }, CLIENT, { key: "type", label: "billing.invoiceType", enumNs: "enums.InvoiceType" }, { key: "issued", label: "billing.issueDate", type: "date" }, { key: "due", label: "billing.dueDate", type: "date" }, money("subtotal", "billing.subtotal"), money("vat", "billing.vat"), money("total", "billing.total"), money("outstanding", "billing.outstanding"), { key: "status", label: "common.status", enumNs: "enums.InvoiceStatus" }],
    run: async (_actor, { client, start, end }) => {
      const rows = await db.invoice.findMany({
        where: { ...(await clientFilter(client)), number: { not: null }, issueDate: { gte: start, lt: end } },
        orderBy: { issueDate: "asc" },
        include: { client: { select: { displayName: true } }, paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } },
      });
      return rows.map((i) => ({ number: i.number, client: i.client.displayName, type: i.type, issued: i.issueDate, due: i.dueDate, subtotal: i.subtotal.toFixed(2), vat: i.vatAmount.toFixed(2), total: i.total.toFixed(2), outstanding: i.status === "VOID" || i.type === "CREDIT_NOTE" ? "0.00" : outstandingOf(i), status: i.status }));
    },
  },
  {
    key: "headcount",
    permission: "employee:read",
    usesPeriod: false,
    columns: [{ key: "number", label: "employees.number" }, { key: "name", label: "finance.employee" }, { key: "classification", label: "employees.classification", enumNs: "enums.Classification" }, { key: "sponsor", label: "employees.sponsor" }, CLIENT, { key: "from", label: "reports.since", type: "date" }],
    run: async (_actor, { client }) => {
      const today = todayDate();
      const rows = await db.allocation.findMany({
        where: { ...(await clientFilter(client)), effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }], employee: { archivedAt: null, status: { not: "EXITED" } } },
        orderBy: [{ client: { displayName: "asc" } }, { employee: { nameEn: "asc" } }],
        select: { effectiveFrom: true, client: { select: { displayName: true } }, employee: { select: { employeeNo: true, nameEn: true, classification: true, sponsor: { select: { name: true } } } } },
      });
      return rows.map((a) => ({ number: a.employee.employeeNo, name: a.employee.nameEn, classification: a.employee.classification, sponsor: a.employee.sponsor?.name ?? null, client: a.client.displayName, from: a.effectiveFrom }));
    },
  },
  {
    key: "documents",
    permission: "document:read",
    usesPeriod: false,
    columns: [{ key: "name", label: "finance.employee" }, { key: "type", label: "reports.documentType", enumNs: "enums.DocumentType" }, { key: "expiry", label: "reports.expiry", type: "date" }, { key: "days", label: "reports.daysLeft", type: "int" }],
    run: async (_actor, { client }) => {
      const today = todayDate();
      const docs = await db.document.findMany({ where: { ownerType: "EMPLOYEE", archivedAt: null, expiryDate: { lte: new Date(today.getTime() + 90 * 86_400_000) } }, orderBy: { expiryDate: "asc" }, select: { ownerId: true, type: true, expiryDate: true } });
      const employees = await db.employee.findMany({
        where: { id: { in: docs.map((d) => d.ownerId) }, archivedAt: null, status: { not: "EXITED" }, ...employeeScope(await getClientScope()), ...(client ? { allocations: { some: { clientId: client } } } : {}) },
        select: { id: true, nameEn: true },
      });
      const names = new Map(employees.map((e) => [e.id, e.nameEn]));
      return docs.filter((d) => names.has(d.ownerId)).map((d) => ({ name: names.get(d.ownerId)!, type: d.type, expiry: d.expiryDate, days: -daysPastDue(d.expiryDate!, today) }));
    },
  },
  {
    key: "cases",
    permission: "case:read",
    usesPeriod: true,
    columns: [{ key: "number", label: "reports.caseNumber" }, { key: "title", label: "reports.subject" }, CLIENT, { key: "owner", label: "reports.owner" }, { key: "severity", label: "reports.severity", enumNs: "enums.Severity" }, { key: "stage", label: "common.status", enumNs: "enums.CaseStage" }, { key: "opened", label: "reports.opened", type: "date" }, { key: "sla", label: "reports.slaDue", type: "date" }, { key: "resolved", label: "reports.resolved", type: "date" }],
    run: async (_actor, { client, start, end }) => {
      const rows = await db.case.findMany({
        where: { ...(await clientFilter(client)), createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: "asc" },
        select: { number: true, title: true, severity: true, stage: true, createdAt: true, slaDueAt: true, resolvedAt: true, client: { select: { displayName: true } }, owner: { select: { name: true } } },
      });
      return rows.map((c) => ({ number: c.number, title: c.title, client: c.client?.displayName ?? null, owner: c.owner.name, severity: c.severity, stage: c.stage, opened: c.createdAt, sla: c.slaDueAt, resolved: c.resolvedAt }));
    },
  },
  {
    key: "expenses",
    permission: "expense:read",
    usesPeriod: true,
    columns: [{ key: "date", label: "finance.incurredAt", type: "date" }, { key: "description", label: "billing.lineDescription" }, { key: "category", label: "finance.category", enumNs: "enums.ExpenseCategory" }, { key: "kind", label: "finance.kind", enumNs: "enums.ExpenseKind" }, CLIENT, money("amount", "billing.amount"), money("vat", "billing.vat"), { key: "status", label: "common.status", enumNs: "enums.ExpenseStatus" }],
    run: async (_actor, { client, start, end }) => {
      const rows = await db.expense.findMany({
        where: { ...(await clientFilter(client)), incurredAt: { gte: start, lt: end } },
        orderBy: { incurredAt: "asc" },
        select: { incurredAt: true, description: true, kind: true, amount: true, vat: true, status: true, category: { select: { code: true } }, client: { select: { displayName: true } } },
      });
      return rows.map((e) => ({ date: e.incurredAt, description: e.description, category: e.category.code, kind: e.kind, client: e.client?.displayName ?? null, amount: e.amount.toFixed(2), vat: e.vat.toFixed(2), status: e.status }));
    },
  },
];

export const findReport = (key: string) => REPORTS.find((r) => r.key === key);

/** Defaults to the last six months, ending now. */
export function reportRange(q: ReportQuery) {
  const months = recentPeriods(6);
  const to = q.to ?? months[0];
  const fromRaw = q.from ?? months[5];
  const from = fromRaw <= to ? fromRaw : to;
  return { from, to, client: q.client || undefined, start: periodBounds(from).start, end: periodBounds(to).end };
}
