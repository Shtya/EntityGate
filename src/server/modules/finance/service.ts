import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { getClientScope } from "@/server/rbac/actor";
import { clientIdFilter, inScope, type Actor } from "@/server/rbac/policy";
import { dateOnly } from "@/server/util";
import { PAGE_SIZE } from "@/server/validation";
import { assertPeriodOpen } from "@/server/modules/billing/service";
import { overlapDays, periodBounds, periodOf, todayDate } from "@/lib/dates";
import { allocationBill, monthlyCost, profitAndLoss, type PayRate, type Pnl } from "@/lib/finance";
import { add, money, round2, type Money } from "@/lib/money";
import type { ExpenseInput, ListExpensesQuery, PayableInput } from "./schema";

const COST_ONLY = { model: "COST_PLUS_PERCENT", feePercent: "0" } as const;
const REVENUE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "PAID", "DISPUTED"] as const;

// ─────────────────────────── Months ───────────────────────────

/** The newest month first, ending at the current one. */
export function recentPeriods(count: number, from = todayDate()): string[] {
  return Array.from({ length: count }, (_, i) => periodOf(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1))));
}

export async function periodChecks(period: string) {
  const { start, end } = periodBounds(period);
  const [row, pendingExpenses, unissuedInvoices, payroll] = await Promise.all([
    db.accountingPeriod.findUnique({ where: { period }, include: { closedBy: { select: { name: true } } } }),
    db.expense.count({ where: { status: "PENDING", incurredAt: { gte: start, lt: end } } }),
    db.invoice.count({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] }, periodStart: { gte: start, lt: end } } }),
    db.payrollRun.findUnique({ where: { period }, select: { status: true } }),
  ]);
  return {
    period,
    status: row?.status ?? ("OPEN" as const),
    closedBy: row?.closedBy?.name ?? null,
    closedAt: row?.closedAt ?? null,
    pendingExpenses,
    unissuedInvoices,
    payroll: payroll?.status ?? null,
    ready: pendingExpenses === 0 && unissuedInvoices === 0 && payroll?.status === "CONFIRMED",
  };
}

export async function listPeriods() {
  return Promise.all(recentPeriods(12).map(periodChecks));
}

/** Closing freezes a month's P&L, so everything feeding it has to be final first. */
export async function closePeriod(actor: Actor, period: string) {
  const checks = await periodChecks(period);
  if (checks.status === "CLOSED") throw invalid("errors.badTransition");
  if (!checks.ready) throw conflict("errors.periodNotReady");
  await db.$transaction(async (tx) => {
    await tx.accountingPeriod.upsert({
      where: { period },
      create: { period, status: "CLOSED", closedById: actor.id, closedAt: new Date() },
      update: { status: "CLOSED", closedById: actor.id, closedAt: new Date() },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "accounting_period", entityId: period, action: "close", after: { name: period } });
  });
  return { period };
}

export async function reopenPeriod(actor: Actor, period: string) {
  const row = await db.accountingPeriod.findUnique({ where: { period } });
  if (row?.status !== "CLOSED") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.accountingPeriod.update({ where: { period }, data: { status: "OPEN", closedById: null, closedAt: null } });
    await writeAudit(tx, { actorId: actor.id, entityType: "accounting_period", entityId: period, action: "reopen", before: { status: "CLOSED" }, after: { name: period, status: "OPEN" } });
  });
  return { period };
}

// ─────────────────────────── Payroll cost register ───────────────────────────

/** Records what staff cost us. It doesn't pay anyone (open question Q6). */
export async function listPayrollRuns() {
  const runs = await db.payrollRun.findMany({ orderBy: { period: "desc" }, take: 36, include: { items: { select: { totalCost: true } } } });
  return runs.map((r) => ({ id: r.id, period: r.period, status: r.status, source: r.source, people: r.items.length, total: add(...r.items.map((i) => i.totalCost.toString())).toFixed(2) }));
}

export async function getPayrollRun(id: string, q: { page: number; q?: string; client?: string }) {
  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound();
  const where: Prisma.PayrollItemWhereInput = {
    payrollRunId: id,
    ...clientIdFilter(await getClientScope()),
    ...(q.client ? { clientId: q.client } : {}),
    ...(q.q ? { employee: { OR: [{ nameEn: { contains: q.q, mode: "insensitive" } }, { employeeNo: { contains: q.q, mode: "insensitive" } }] } } : {}),
  };
  const [rows, total, sums] = await Promise.all([
    db.payrollItem.findMany({
      where,
      orderBy: { employee: { nameEn: "asc" } },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { employee: { select: { id: true, nameEn: true, employeeNo: true } }, client: { select: { id: true, displayName: true } } },
    }),
    db.payrollItem.count({ where }),
    db.payrollItem.aggregate({ where, _sum: { gross: true, gosi: true, otherCosts: true, totalCost: true } }),
  ]);
  return { run, rows, total, page: q.page, sums: sums._sum };
}

async function assertRunEditable(period: string) {
  await assertPeriodOpen(db, period);
  const run = await db.payrollRun.findUnique({ where: { period }, select: { status: true } });
  if (run?.status === "CONFIRMED") throw conflict("errors.payrollConfirmed");
}

type ItemDraft = { employeeId: string; clientId: string | null; gross: string; gosi: string; otherCosts: string; totalCost: string };

async function replaceItems(actor: Actor, period: string, source: "IMPORT" | "MANUAL", items: ItemDraft[]) {
  return db.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.upsert({ where: { period }, create: { period, source }, update: { source } });
      await tx.payrollItem.deleteMany({ where: { payrollRunId: run.id } });
      if (items.length) await tx.payrollItem.createMany({ data: items.map((i) => ({ ...i, payrollRunId: run.id })) });
      const total = add(...items.map((i) => i.totalCost)).toFixed(2);
      await writeAudit(tx, { actorId: actor.id, entityType: "payroll_run", entityId: run.id, action: source === "IMPORT" ? "import" : "generate", after: { name: period, items: items.length, total } });
      return { id: run.id, items: items.length, total };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/**
 * Builds the month from pay records. Someone moved between clients gets one line per client, so
 * each client's P&L carries only its own days. Days with no client are kept as unallocated cost.
 */
export async function generatePayroll(actor: Actor, period: string) {
  await assertRunEditable(period);
  const { start, end, days } = periodBounds(period);
  const overlapping = { effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }] };
  const employees = await db.employee.findMany({
    where: { compensations: { some: overlapping }, OR: [{ exitedAt: null }, { exitedAt: { gte: start } }] },
    select: { id: true, exitedAt: true, compensations: true, allocations: { where: overlapping, select: { clientId: true, effectiveFrom: true, effectiveTo: true } } },
  });
  const items: ItemDraft[] = [];
  for (const e of employees) {
    const dayAfterExit = e.exitedAt ? new Date(e.exitedAt.getTime() + 86_400_000) : null;
    const cap = (to: Date | null) => (dayAfterExit && (!to || dayAfterExit < to) ? dayAfterExit : to);
    const pays = (pick: (c: (typeof e.compensations)[number]) => unknown): PayRate[] => e.compensations.map((c) => ({ from: c.effectiveFrom, to: c.effectiveTo, monthly: String(pick(c)) }));
    const piece = (from: Date, to: Date | null, clientId: string | null): ItemDraft | null => {
      const total = allocationBill(from, to, pays(monthlyCost), period, COST_ONLY).cost;
      if (total.lessThanOrEqualTo(0)) return null;
      const gosi = allocationBill(from, to, pays((c) => c.gosiEmployer), period, COST_ONLY).cost;
      const other = allocationBill(from, to, pays((c) => c.insuranceMonthly), period, COST_ONLY).cost;
      return { employeeId: e.id, clientId, gross: total.minus(gosi).minus(other).toFixed(2), gosi: gosi.toFixed(2), otherCosts: other.toFixed(2), totalCost: total.toFixed(2) };
    };
    let daysPlaced = 0;
    let placed = money(0);
    let placedGosi = money(0);
    let placedOther = money(0);
    for (const a of e.allocations) {
      const to = cap(a.effectiveTo);
      daysPlaced += overlapDays(a.effectiveFrom, to, period);
      const row = piece(a.effectiveFrom, to, a.clientId);
      if (!row) continue;
      items.push(row);
      placed = placed.plus(row.totalCost);
      placedGosi = placedGosi.plus(row.gosi);
      placedOther = placedOther.plus(row.otherCosts);
    }
    if (daysPlaced >= days) continue;
    // Whatever the month's pay comes to beyond the placed days is unallocated.
    const earliest = e.compensations.reduce((a, c) => (c.effectiveFrom < a ? c.effectiveFrom : a), e.compensations[0].effectiveFrom);
    const whole = piece(earliest, dayAfterExit, null);
    if (!whole) continue;
    const bench = money(whole.totalCost).minus(placed);
    if (bench.lessThanOrEqualTo(0)) continue;
    const gosi = money(whole.gosi).minus(placedGosi);
    const other = money(whole.otherCosts).minus(placedOther);
    items.push({ employeeId: e.id, clientId: null, gross: bench.minus(gosi).minus(other).toFixed(2), gosi: gosi.toFixed(2), otherCosts: other.toFixed(2), totalCost: bench.toFixed(2) });
  }
  return replaceItems(actor, period, "MANUAL", items);
}

export const PAYROLL_COLUMNS = ["employee_no", "gross", "gosi", "other_costs"] as const;

export async function payrollTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Payroll");
  sheet.addRow([...PAYROLL_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  PAYROLL_COLUMNS.forEach((_, i) => (sheet.getColumn(i + 1).width = 16));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (typeof v === "object" && "text" in v) return String(v.text ?? "");
  return String(v).trim();
}
const AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

/** All or nothing: one bad row and the month stays as it was, with every problem listed. */
export async function importPayroll(actor: Actor, period: string, file: File) {
  await assertRunEditable(period);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw invalid("errors.importUnreadable");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw invalid("errors.importUnreadable");
  const header = Array.from(sheet.getRow(1).values as ExcelJS.CellValue[], (v) => cellText(v).toLowerCase());
  if (PAYROLL_COLUMNS.some((c) => !header.includes(c))) throw invalid("errors.importColumns");
  const col = (c: (typeof PAYROLL_COLUMNS)[number]) => header.indexOf(c);

  const { start, end } = periodBounds(period);
  const employees = await db.employee.findMany({
    select: { id: true, employeeNo: true, allocations: { where: { effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }] }, select: { clientId: true, effectiveFrom: true, effectiveTo: true } } },
  });
  const byNo = new Map(employees.map((e) => [e.employeeNo, e]));
  const seen = new Set<string>();
  const items: ItemDraft[] = [];
  const problems: { path: string; message: string }[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const values = row.values as ExcelJS.CellValue[];
    const no = cellText(values[col("employee_no")]);
    const nums = (["gross", "gosi", "other_costs"] as const).map((c) => cellText(values[col(c)]) || "0");
    if (!no && nums.every((x) => x === "0")) return;
    const path = `row_${n}`;
    const employee = byNo.get(no);
    if (!employee) problems.push({ path, message: "validation.employeeUnknown" });
    else if (seen.has(no)) problems.push({ path, message: "validation.employeeTwice" });
    else if (nums.some((x) => !AMOUNT.test(x))) problems.push({ path, message: "validation.money" });
    if (!employee || problems.some((p) => p.path === path)) return;
    seen.add(no);
    // The client with the most days this month, since an imported line isn't split by day.
    const main = employee.allocations.map((a) => ({ id: a.clientId, days: overlapDays(a.effectiveFrom, a.effectiveTo, period) })).sort((a, b) => b.days - a.days)[0];
    const [gross, gosi, otherCosts] = nums.map((x) => round2(x).toFixed(2));
    items.push({ employeeId: employee.id, clientId: main?.id ?? null, gross, gosi, otherCosts, totalCost: add(gross, gosi, otherCosts).toFixed(2) });
  });
  if (problems.length) throw invalid("errors.importHasErrors", problems);
  if (!items.length) throw invalid("errors.importEmpty");
  return replaceItems(actor, period, "IMPORT", items);
}

export async function setPayrollConfirmed(actor: Actor, id: string, confirmed: boolean) {
  const run = await db.payrollRun.findUnique({ where: { id } });
  if (!run) throw notFound();
  await assertPeriodOpen(db, run.period);
  await db.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id }, data: { status: confirmed ? "CONFIRMED" : "DRAFT" } });
    await writeAudit(tx, { actorId: actor.id, entityType: "payroll_run", entityId: id, action: confirmed ? "confirm" : "unconfirm", after: { name: run.period } });
  });
  return { id };
}

// ─────────────────────────── Expenses ───────────────────────────

export async function expenseCategories() {
  return db.expenseCategory.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
}

export async function employeeOptionsForExpense() {
  const scope = await getClientScope();
  const rows = await db.employee.findMany({
    where: { status: { not: "EXITED" }, ...(scope.kind === "all" ? {} : { allocations: { some: { clientId: { in: scope.clientIds } } } }) },
    orderBy: { nameEn: "asc" },
    take: 1000,
    select: { id: true, nameEn: true, employeeNo: true },
  });
  return rows.map((e) => ({ value: e.id, label: `${e.nameEn} (${e.employeeNo})` }));
}

export async function listExpenses(q: ListExpensesQuery & { caseId?: string }) {
  const scope = await getClientScope();
  const month = q.month ? periodBounds(q.month) : null;
  const where: Prisma.ExpenseWhereInput = {
    ...clientIdFilter(scope),
    status: q.status,
    kind: q.kind,
    ...(q.caseId ? { caseId: q.caseId } : {}),
    ...(q.client ? { clientId: q.client } : {}),
    ...(month ? { incurredAt: { gte: month.start, lt: month.end } } : {}),
    ...(q.q ? { OR: [{ description: { contains: q.q, mode: "insensitive" } }, { vendor: { contains: q.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, sum] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { code: true, name: true } },
        client: { select: { id: true, displayName: true } },
        employee: { select: { id: true, nameEn: true } },
        billedLine: { select: { invoiceId: true, invoice: { select: { number: true } } } },
      },
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { rows, total, page: q.page, sum: sum._sum.amount?.toString() ?? "0" };
}

export async function createExpense(actor: Actor, input: ExpenseInput) {
  const incurred = dateOnly(input.incurredAt);
  await assertPeriodOpen(db, periodOf(incurred));
  const category = await db.expenseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw invalid("errors.validation", [{ path: "categoryId", message: "validation.required" }]);
  const overhead = category.kind === "OVERHEAD";
  const clientId = overhead ? null : (input.clientId ?? null);
  // Overhead belongs to the company, so people limited to their own clients can't record it.
  const scope = await getClientScope();
  if (scope.kind !== "all" && (!clientId || !inScope(scope, clientId))) throw forbidden();
  const recoverable = overhead ? false : (input.recoverable ?? category.recoverableDefault);
  if (recoverable && !clientId) throw invalid("errors.validation", [{ path: "clientId", message: "validation.recoverableNeedsClient" }]);
  return db.$transaction(async (tx) => {
    const row = await tx.expense.create({
      data: {
        categoryId: category.id,
        kind: category.kind,
        clientId,
        employeeId: overhead ? null : input.employeeId,
        caseId: overhead ? null : input.caseId,
        description: input.description,
        amount: input.amount,
        vat: input.vat ?? "0",
        incurredAt: incurred,
        vendor: input.vendor,
        recoverable,
        attachmentId: input.attachmentId,
      },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "expense", entityId: row.id, action: "create", after: { name: input.description, amount: input.amount, recoverable } });
    return { id: row.id };
  });
}

export async function decideExpense(actor: Actor, id: string, approved: boolean) {
  const expense = await db.expense.findUnique({ where: { id } });
  if (!expense) throw notFound();
  if (!inScope(await getClientScope(), expense.clientId)) throw forbidden();
  if (expense.billedLineId) throw invalid("errors.expenseBilled");
  await assertPeriodOpen(db, periodOf(expense.incurredAt));
  const status = approved ? "APPROVED" : "REJECTED";
  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { status } });
    await writeAudit(tx, { actorId: actor.id, entityType: "expense", entityId: id, action: approved ? "approve" : "reject", before: { status: expense.status }, after: { status } });
  });
  return { id };
}

// ─────────────────────────── Payables ───────────────────────────

/** What the company owes others. Due dates drive the PAYABLE_DUE reminder rule. */
export async function listPayables(q: { page: number; q?: string; status: "OPEN" | "PAID" | "CANCELLED" }) {
  const where: Prisma.PayableWhereInput = { status: q.status, ...(q.q ? { description: { contains: q.q, mode: "insensitive" } } : {}) };
  const today = todayDate();
  const [rows, total, open, overdue] = await Promise.all([
    db.payable.findMany({ where, orderBy: { dueDate: q.status === "OPEN" ? "asc" : "desc" }, skip: (q.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.payable.count({ where }),
    db.payable.aggregate({ where: { status: "OPEN" }, _sum: { amount: true } }),
    db.payable.aggregate({ where: { status: "OPEN", dueDate: { lt: today } }, _sum: { amount: true } }),
  ]);
  return { rows, total, page: q.page, open: open._sum.amount?.toString() ?? "0", overdue: overdue._sum.amount?.toString() ?? "0" };
}

export async function createPayable(actor: Actor, input: PayableInput) {
  return db.$transaction(async (tx) => {
    const row = await tx.payable.create({ data: { type: input.type, description: input.description, dueDate: dateOnly(input.dueDate), amount: input.amount, reference: input.reference } });
    await writeAudit(tx, { actorId: actor.id, entityType: "payable", entityId: row.id, action: "create", after: { name: input.description, amount: input.amount } });
    return { id: row.id };
  });
}

export async function setPayableStatus(actor: Actor, id: string, status: "OPEN" | "PAID" | "CANCELLED", reference?: string | null) {
  const row = await db.payable.findUnique({ where: { id } });
  if (!row) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.payable.update({ where: { id }, data: { status, paidAt: status === "PAID" ? new Date() : null, ...(reference ? { reference } : {}) } });
    await writeAudit(tx, { actorId: actor.id, entityType: "payable", entityId: id, action: "status_change", before: { status: row.status }, after: { status } });
  });
  return { id };
}

// ─────────────────────────── Profit & loss ───────────────────────────

interface Bucket {
  revenue: Money[];
  credits: Money[];
  payroll: Money[];
  expenses: Money[];
  overhead: Money[];
}
const emptyBucket = (): Bucket => ({ revenue: [], credits: [], payroll: [], expenses: [], overhead: [] });
const toPnl = (b: Bucket): Pnl => profitAndLoss({ revenue: b.revenue, creditNotes: b.credits, payroll: b.payroll, directExpenses: b.expenses, overhead: b.overhead });

export interface PnlRow {
  id: string;
  name: string;
  pnl: Pnl;
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let cursor = periodBounds(from).start;
  const stop = periodBounds(to).end;
  while (cursor < stop) {
    out.push(periodOf(cursor));
    cursor = periodBounds(periodOf(cursor)).end;
  }
  return out;
}

/**
 * Revenue − direct cost = contribution; contribution − overhead = net (PLAN §2.4). Monthly invoices
 * count in the month they bill, others when issued, and credit notes when issued, so a credit
 * never rewrites a closed month. Amounts exclude VAT. People limited to certain clients see only
 * those clients, without company overhead.
 */
export async function pnl(from: string, to: string, onlyClientIds?: string[]) {
  if (from > to) throw invalid("errors.validation", [{ path: "from", message: "validation.endAfterStart" }]);
  const scope = await getClientScope();
  const companyView = scope.kind === "all" && !onlyClientIds;
  const ids = scope.kind === "all" ? onlyClientIds : scope.clientIds.filter((c) => !onlyClientIds || onlyClientIds.includes(c));
  const clientFilter = ids ? { clientId: { in: ids } } : {};
  const start = periodBounds(from).start;
  const end = periodBounds(to).end;
  const inRange = { gte: start, lt: end };

  const [invoices, payroll, expenses] = await Promise.all([
    db.invoice.findMany({
      where: {
        ...clientFilter,
        status: { in: [...REVENUE_STATUSES] },
        OR: [{ type: "CREDIT_NOTE", issueDate: inRange }, { type: { not: "CREDIT_NOTE" }, periodStart: inRange }, { type: { not: "CREDIT_NOTE" }, periodStart: null, issueDate: inRange }],
      },
      select: { clientId: true, type: true, subtotal: true, periodStart: true, issueDate: true, client: { select: { displayName: true } } },
    }),
    db.payrollItem.findMany({
      where: { ...clientFilter, payrollRun: { period: { gte: from, lte: to } } },
      select: { clientId: true, totalCost: true, payrollRun: { select: { period: true } }, client: { select: { displayName: true } } },
    }),
    db.expense.findMany({
      where: { ...clientFilter, status: "APPROVED", incurredAt: inRange },
      select: { clientId: true, kind: true, amount: true, incurredAt: true, client: { select: { displayName: true } } },
    }),
  ]);

  const company = emptyBucket();
  const clients = new Map<string, Bucket>();
  const names = new Map<string, string>();
  const months = new Map(monthsBetween(from, to).map((m) => [m, emptyBucket()]));
  /** Adds an amount to the company, month and (when there is one) client totals. */
  const post = (key: keyof Bucket, amount: Money, period: string, clientId: string | null, name?: string) => {
    company[key].push(amount);
    months.get(period)?.[key].push(amount);
    if (!clientId) return;
    if (name) names.set(clientId, name);
    if (!clients.has(clientId)) clients.set(clientId, emptyBucket());
    clients.get(clientId)![key].push(amount);
  };

  for (const i of invoices) {
    const isCredit = i.type === "CREDIT_NOTE";
    const when = !isCredit && i.periodStart ? i.periodStart : i.issueDate!;
    const amount = money(i.subtotal.toString());
    post(isCredit ? "credits" : "revenue", isCredit ? amount.abs() : amount, periodOf(when), i.clientId, i.client.displayName);
  }
  const unallocated: Money[] = [];
  for (const p of payroll) {
    const amount = money(p.totalCost.toString());
    post("payroll", amount, p.payrollRun.period, p.clientId, p.client?.displayName);
    if (!p.clientId) unallocated.push(amount);
  }
  for (const e of expenses) {
    const amount = money(e.amount.toString());
    if (e.kind === "OVERHEAD") post("overhead", amount, periodOf(e.incurredAt), null);
    else post("expenses", amount, periodOf(e.incurredAt), e.clientId, e.client?.displayName);
  }

  // Who owned each account at the end of the range.
  const lastDay = new Date(end.getTime() - 86_400_000);
  const owners = await db.accountAssignment.findMany({
    where: { clientId: { in: [...clients.keys()] }, role: "OWNER", effectiveFrom: { lte: lastDay }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: lastDay } }] },
    select: { clientId: true, user: { select: { id: true, name: true } } },
  });
  const managers = new Map<string, { name: string; bucket: Bucket }>();
  for (const [clientId, b] of clients) {
    const owner = owners.find((o) => o.clientId === clientId)?.user;
    const key = owner?.id ?? "none";
    if (!managers.has(key)) managers.set(key, { name: owner?.name ?? "", bucket: emptyBucket() });
    const target = managers.get(key)!.bucket;
    (Object.keys(b) as (keyof Bucket)[]).forEach((k) => target[k].push(...b[k]));
  }

  const byContribution = (a: PnlRow, b: PnlRow) => b.pnl.contribution.comparedTo(a.pnl.contribution);
  return {
    from,
    to,
    companyView,
    company: toPnl(company),
    unallocated: add(...unallocated),
    clients: [...clients].map(([id, b]): PnlRow => ({ id, name: names.get(id) ?? id, pnl: toPnl(b) })).sort(byContribution),
    managers: [...managers].map(([id, m]): PnlRow => ({ id, name: m.name, pnl: toPnl(m.bucket) })).sort(byContribution),
    months: [...months].map(([id, b]): PnlRow => ({ id, name: id, pnl: toPnl(b) })),
  };
}
