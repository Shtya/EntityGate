import "server-only";
import ExcelJS from "exceljs";
import type { PermissionKey } from "@/server/rbac/catalog";
import type { Actor } from "@/server/rbac/policy";
import { listInvoicesQuery, listPaymentsQuery } from "@/server/modules/billing/schema";
import { listInvoices, listPayments } from "@/server/modules/billing/service";
import { listClientsQuery } from "@/server/modules/clients/schema";
import { listClients } from "@/server/modules/clients/service";
import { listEmployeesQuery } from "@/server/modules/employees/schema";
import { listEmployees } from "@/server/modules/employees/service";
import { listExpensesQuery } from "@/server/modules/finance/schema";
import { listExpenses } from "@/server/modules/finance/service";
import { listCasesQuery, listTasksQuery } from "@/server/modules/operations/schema";
import { listCases, listTasks } from "@/server/modules/operations/service";
import { listServices, listServicesQuery } from "@/server/modules/price-list/service";
import { toDateOnly } from "@/lib/dates";
import { safeCsvText } from "./export";

type T = { (key: string): string; has(key: string): boolean };
type Cell = string | number | null;
type Params = Record<string, string>;

interface Column<R> {
  /** Message key for the heading. */
  label: string;
  type?: "money" | "int" | "date";
  value: (row: R, t: T, locale: string) => Cell | Date | undefined;
}
interface ListExport<R> {
  permission: PermissionKey;
  /** Message key for the sheet name. */
  title: string;
  page: (actor: Actor, params: Params, page: number) => Promise<{ rows: R[]; total: number }>;
  columns: Column<R>[];
}

const MAX_ROWS = 20_000;
const define = <R,>(d: ListExport<R>) => d as unknown as ListExport<unknown>;
const tr = (t: T, ns: string, v: string | null | undefined) => (v && t.has(`${ns}.${v}`) ? t(`${ns}.${v}`) : (v ?? null));
const name = (locale: string, e: { nameEn: string; nameAr: string | null } | null | undefined) => (e ? (locale === "ar" && e.nameAr) || e.nameEn : null);
const amount = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));

/**
 * Every list's Excel export. Each one calls the same function as the page, with the same filters,
 * so a file can never hold more than its reader could open on screen.
 */
export const LIST_EXPORTS: Record<string, ListExport<unknown>> = {
  clients: define({
    permission: "client:read",
    title: "nav.clients",
    page: (_a, p, page) => listClients(listClientsQuery.parse({ ...p, page })),
    columns: [
      { label: "master.code", value: (c) => c.code },
      { label: "clients.client", value: (c) => c.displayName },
      { label: "clients.owner", value: (c) => c.assignments[0]?.user.name ?? null },
      { label: "clients.headcount", type: "int", value: (c) => c._count.allocations },
      { label: "clients.openCases", type: "int", value: (c) => c._count.cases },
      { label: "clients.health", value: (c, t) => tr(t, "enums.ClientHealth", c.health) },
      { label: "common.status", value: (c, t) => tr(t, "enums.ClientStatus", c.status) },
    ],
  }),
  employees: define({
    permission: "employee:read",
    title: "nav.employees",
    page: (_a, p, page) => listEmployees(listEmployeesQuery.parse({ ...p, page })),
    columns: [
      { label: "employees.employeeNo", value: (e) => e.employeeNo },
      { label: "employees.employee", value: (e) => e.nameEn },
      { label: "employees.nameAr", value: (e) => e.nameAr },
      { label: "employees.jobTitle", value: (e) => e.jobTitle },
      { label: "employees.client", value: (e) => e.allocations[0]?.client.displayName ?? null },
      { label: "employees.sponsor", value: (e) => e.sponsor?.name ?? null },
      { label: "employees.classification", value: (e, t) => tr(t, "enums.WorkerClassification", e.classification) },
      { label: "common.status", value: (e, t) => tr(t, "enums.EmployeeStatus", e.status) },
      { label: "employees.nextExpiry", type: "date", value: (e) => e.nextExpiry?.expiryDate ?? null },
    ],
  }),
  tasks: define({
    permission: "task:read",
    title: "nav.tasks",
    page: (a, p, page) => listTasks(a, listTasksQuery.parse({ ...p, page })),
    columns: [
      { label: "reports.caseNumber", value: (r) => r.number },
      { label: "tasks.task", value: (r) => r.title },
      { label: "employees.client", value: (r) => r.client?.displayName ?? null },
      { label: "tasks.owner", value: (r) => r.owner.name },
      { label: "tasks.due", type: "date", value: (r) => r.dueAt },
      { label: "tasks.priority", value: (r, t) => tr(t, "enums.Priority", r.priority) },
      { label: "common.status", value: (r, t) => tr(t, "enums.TaskStatus", r.status) },
    ],
  }),
  cases: define({
    permission: "case:read",
    title: "nav.cases",
    page: (a, p, page) => listCases(a, listCasesQuery.parse({ ...p, page })),
    columns: [
      { label: "reports.caseNumber", value: (c) => c.number },
      { label: "cases.case", value: (c) => c.title },
      { label: "cases.category", value: (c, t) => tr(t, "enums.CaseCategory", c.category.code) ?? c.category.name },
      { label: "employees.client", value: (c) => c.client?.displayName ?? null },
      { label: "finance.employee", value: (c, _t, l) => name(l, c.employee) },
      { label: "tasks.owner", value: (c) => c.owner.name },
      { label: "cases.stage", value: (c, t) => tr(t, "enums.CaseStage", c.stage) },
      { label: "cases.severity", value: (c, t) => tr(t, "enums.Severity", c.severity) },
      { label: "reports.slaDue", type: "date", value: (c) => c.slaDueAt },
      { label: "reports.opened", type: "date", value: (c) => c.createdAt },
    ],
  }),
  invoices: define({
    permission: "invoice:read",
    title: "billing.invoices",
    page: (_a, p, page) => listInvoices(listInvoicesQuery.parse({ ...p, page })),
    columns: [
      { label: "billing.invoice", value: (i, t) => i.number ?? t("billing.draft") },
      { label: "employees.client", value: (i) => i.client.displayName },
      { label: "billing.invoiceType", value: (i, t) => tr(t, "enums.InvoiceType", i.type) },
      { label: "billing.issueDate", type: "date", value: (i) => i.issueDate },
      { label: "billing.dueDate", type: "date", value: (i) => i.dueDate },
      { label: "billing.subtotal", type: "money", value: (i) => amount(i.subtotal) },
      { label: "billing.vat", type: "money", value: (i) => amount(i.vatAmount) },
      { label: "billing.total", type: "money", value: (i) => amount(i.total) },
      { label: "billing.outstanding", type: "money", value: (i) => (i.number ? amount(i.outstanding) : null) },
      { label: "billing.po", value: (i) => i.poNumber },
      { label: "common.status", value: (i, t) => tr(t, "enums.InvoiceStatus", i.status) },
    ],
  }),
  payments: define({
    permission: "payment:read",
    title: "billing.payments",
    page: (_a, p, page) => listPayments(listPaymentsQuery.parse({ ...p, page })),
    columns: [
      { label: "billing.receivedOn", type: "date", value: (p) => p.receivedAt },
      { label: "employees.client", value: (p) => p.client.displayName },
      { label: "billing.method", value: (p, t) => tr(t, "enums.PaymentMethod", p.method) },
      { label: "billing.reference", value: (p) => p.reference },
      { label: "billing.amount", type: "money", value: (p) => amount(p.amount) },
      { label: "billing.appliedTo", value: (p) => p.allocations.map((a) => a.invoice.number).filter(Boolean).join(", ") || null },
      { label: "billing.reconciled", value: (p, t) => t(p.reconciled ? "common.yes" : "common.no") },
    ],
  }),
  expenses: define({
    permission: "expense:read",
    title: "finance.expenses",
    page: (_a, p, page) => listExpenses(listExpensesQuery.parse({ ...p, page })),
    columns: [
      { label: "finance.incurredAt", type: "date", value: (e) => e.incurredAt },
      { label: "billing.lineDescription", value: (e) => e.description },
      { label: "finance.category", value: (e, t) => tr(t, "enums.ExpenseCategory", e.category.code) ?? e.category.name },
      { label: "finance.kind", value: (e, t) => tr(t, "enums.ExpenseKind", e.kind) },
      { label: "employees.client", value: (e) => e.client?.displayName ?? null },
      { label: "finance.employee", value: (e) => e.employee?.nameEn ?? null },
      { label: "finance.vendor", value: (e) => e.vendor },
      { label: "billing.amount", type: "money", value: (e) => amount(e.amount) },
      { label: "billing.vat", type: "money", value: (e) => amount(e.vat) },
      { label: "finance.recoverable", value: (e, t) => t(e.recoverable ? "common.yes" : "common.no") },
      { label: "common.status", value: (e, t) => tr(t, "enums.ExpenseStatus", e.status) },
    ],
  }),
  "price-list": define({
    permission: "invoice:read",
    title: "nav.priceList",
    page: (_a, p, page) => listServices(listServicesQuery.parse({ ...p, page })),
    columns: [
      { label: "master.code", value: (s) => s.code },
      { label: "priceList.nameEn", value: (s) => s.nameEn },
      { label: "priceList.nameAr", value: (s) => s.nameAr },
      { label: "priceList.unit", value: (s, t) => tr(t, "enums.ServiceUnit", s.unit) },
      { label: "priceList.price", type: "money", value: (s) => amount(s.price) },
      { label: "common.status", value: (s, t) => t(s.active ? "master.active" : "master.inactive") },
      { label: "common.notes", value: (s) => s.notes },
    ],
  }),
};

/** Collects every page of the filtered list, up to a ceiling that keeps one request bounded. */
async function allRows(def: ListExport<unknown>, actor: Actor, params: Params) {
  const rows: unknown[] = [];
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const res = await def.page(actor, params, page);
    rows.push(...res.rows);
    if (!res.rows.length || rows.length >= res.total) break;
  }
  return rows.slice(0, MAX_ROWS);
}

export async function exportList(def: ListExport<unknown>, actor: Actor, params: Params, t: T, locale: string) {
  const rows = await allRows(def, actor, params);
  const wb = new ExcelJS.Workbook();
  wb.creator = "EntityGate";
  const sheet = wb.addWorksheet(t(def.title).slice(0, 31), { views: [{ rightToLeft: locale === "ar", state: "frozen", ySplit: 1 }] });
  sheet.addRow(def.columns.map((c) => t(c.label)));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(
      def.columns.map((c) => {
        const v = c.value(row, t, locale);
        if (v === null || v === undefined) return null;
        if (v instanceof Date) return toDateOnly(v);
        // Text from people's records must never run as a spreadsheet formula.
        return typeof v === "string" ? safeCsvText(v) : v;
      }),
    );
  }
  def.columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = c.type === "money" ? 15 : c.type === "date" || c.type === "int" ? 13 : 26;
    if (c.type === "money") col.numFmt = "#,##0.00";
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: def.columns.length } };
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), count: rows.length };
}
