import "server-only";
import type { Prisma } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { db, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { clientIdFilter, inScope, type Actor } from "@/server/rbac/policy";
import { getClientScope } from "@/server/rbac/actor";
import { activeOn, dateOnly, nextNumber, pad } from "@/server/util";
import { PAGE_SIZE } from "@/server/validation";
import { periodBounds, periodOf, todayDate } from "@/lib/dates";
import { agingSummary, allocationBill, invoiceTotals, monthlyCost, outstanding, paymentState, type RateInput } from "@/lib/finance";
import { add, money, round2, vatOf } from "@/lib/money";
import type { InvoiceInput, ListInvoicesQuery, PaymentInput } from "./schema";

const OPEN = ["ISSUED", "PARTIALLY_PAID", "DISPUTED"] as const;

/** Numbers issued in a closed month would change a P&L people have already signed off. */
export async function assertPeriodOpen(client: Tx | typeof db, period: string) {
  const row = await client.accountingPeriod.findUnique({ where: { period } });
  if (row?.status === "CLOSED") throw conflict("errors.periodClosed");
}

async function assertAccess(clientId: string) {
  if (!inScope(await getClientScope(), clientId)) throw forbidden();
}

// ─────────────────────────── Billing runs ───────────────────────────

type RunWarning = { client: string; employee: string; kind: "noPay" };

type RunContract = Prisma.ContractGetPayload<{ include: { rateCards: true; client: { select: { id: true; displayName: true } } } }>;
type RunAllocation = Prisma.AllocationGetPayload<{ include: { employee: { select: { id: true; nameEn: true; compensations: true } } } }>;
type RunExpense = Prisma.ExpenseGetPayload<object>;

/** Builds one client's draft: employees, fees, then recoverable costs nobody has billed yet. */
async function buildClientDraft(tx: Tx, runId: string, period: string, contract: RunContract, allocations: RunAllocation[], expenses: RunExpense[]) {
  const { start, end, days } = periodBounds(period);
  const lastDay = new Date(end.getTime() - 86_400_000);
  const card = contract.rateCards.find((r) => r.effectiveFrom <= lastDay && (!r.effectiveTo || r.effectiveTo > lastDay));
  if (!card) return { invoice: null, warnings: [] as RunWarning[] };
  const rate: RateInput = { model: contract.billingModel, feePercent: card.feePercent?.toString(), feePerHead: card.feePerHead?.toString(), feeFixedMonthly: card.feeFixedMonthly?.toString() };

  const warnings: RunWarning[] = [];
  const lines: Prisma.InvoiceLineUncheckedCreateWithoutInvoiceInput[] = [];
  let position = 0;

  for (const a of allocations) {
    const bill = allocationBill(a.effectiveFrom, a.effectiveTo, a.employee.compensations.map((c) => ({ from: c.effectiveFrom, to: c.effectiveTo, monthly: monthlyCost(c) })), period, rate);
    if (bill.daysActive === 0) continue;
    if (bill.cost.isZero()) warnings.push({ client: contract.client.displayName, employee: a.employee.nameEn, kind: "noPay" });
    lines.push({
      position: position++,
      description: `${a.employee.nameEn} (${bill.daysActive}/${days})`,
      sourceType: "ALLOCATION",
      allocationId: a.id,
      employeeId: a.employee.id,
      quantity: money(bill.daysActive).dividedBy(days).toDecimalPlaces(4).toString(),
      unitAmount: bill.amount.toString(),
      amount: bill.amount.toString(),
      costAmount: bill.cost.toString(),
    });
  }

  if (contract.billingModel === "COST_PLUS_FIXED" && lines.length && card.feeFixedMonthly) {
    const fee = round2(card.feeFixedMonthly.toString());
    lines.push({ position: position++, description: "Monthly service fee", sourceType: "FEE", unitAmount: fee.toString(), amount: fee.toString(), costAmount: "0" });
  }
  if (!lines.length && !expenses.length) return { invoice: null, warnings };

  const expensePositions = new Map<number, string>();
  for (const e of expenses) {
    expensePositions.set(position, e.id);
    lines.push({ position: position++, description: e.description, sourceType: "EXPENSE", employeeId: e.employeeId, unitAmount: e.amount, amount: e.amount, costAmount: e.amount });
  }
  const totals = invoiceTotals(lines.map((l) => String(l.amount)), contract.vatRate.toString());
  const invoice = await tx.invoice.create({
    data: {
      clientId: contract.clientId,
      billingRunId: runId,
      type: "MONTHLY",
      periodStart: start,
      periodEnd: lastDay,
      currency: contract.currency,
      vatRate: contract.vatRate,
      subtotal: totals.subtotal.toString(),
      vatAmount: totals.vat.toString(),
      total: totals.total.toString(),
      lines: { create: lines },
    },
    include: expensePositions.size ? { lines: { where: { sourceType: "EXPENSE" }, select: { id: true, position: true } } } : undefined,
  });
  if (expensePositions.size) {
    for (const line of (invoice as unknown as { lines: { id: string; position: number }[] }).lines) {
      await tx.expense.update({ where: { id: expensePositions.get(line.position)! }, data: { billedLineId: line.id } });
    }
  }
  return { invoice, warnings };
}

/** One live run per month: a second would invoice everyone twice (also enforced by a DB index). */
export async function createBillingRun(actor: Actor, period: string) {
  await assertPeriodOpen(db, period);
  const { start, end } = periodBounds(period);
  const contracts = await db.contract.findMany({
    where: { status: "ACTIVE", startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }], client: { status: { in: ["ACTIVE", "SUSPENDED"] }, archivedAt: null } },
    include: { rateCards: true, client: { select: { id: true, displayName: true } } },
    orderBy: { startDate: "desc" },
  });
  // A client with two overlapping contracts is billed once, on its newest.
  const byClient = new Map<string, (typeof contracts)[number]>();
  for (const c of contracts) if (!byClient.has(c.clientId)) byClient.set(c.clientId, c);

  return db.$transaction(
    async (tx) => {
      const run = await tx.billingRun.create({ data: { period, createdById: actor.id } });
      const clientIds = [...byClient.keys()];
      const [allocations, expenses] = await Promise.all([
        tx.allocation.findMany({
          where: { clientId: { in: clientIds }, billable: true, effectiveFrom: { lt: end }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }] },
          include: { employee: { select: { id: true, nameEn: true, compensations: true } } },
          orderBy: { employee: { nameEn: "asc" } },
        }),
        tx.expense.findMany({ where: { clientId: { in: clientIds }, recoverable: true, status: "APPROVED", billedLineId: null, incurredAt: { lt: end } }, orderBy: { incurredAt: "asc" } }),
      ]);
      const warnings: RunWarning[] = [];
      let invoices = 0;
      for (const contract of byClient.values()) {
        const result = await buildClientDraft(tx, run.id, period, contract, allocations.filter((a) => a.clientId === contract.clientId), expenses.filter((e) => e.clientId === contract.clientId));
        warnings.push(...result.warnings);
        if (result.invoice) invoices++;
      }
      await writeAudit(tx, { actorId: actor.id, entityType: "billing_run", entityId: run.id, action: "create", after: { name: period, invoices } });
      return { id: run.id, invoices, warnings };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

export async function listRuns() {
  return db.billingRun.findMany({
    orderBy: { period: "desc" },
    take: 36,
    include: { createdBy: { select: { name: true } }, approvedBy: { select: { name: true } }, invoices: { select: { total: true, status: true } } },
  });
}

export async function getRun(id: string) {
  const run = await db.billingRun.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      invoices: { orderBy: { client: { displayName: "asc" } }, include: { client: { select: { id: true, displayName: true } }, _count: { select: { lines: true } }, lines: { where: { sourceType: "ALLOCATION", costAmount: 0 }, select: { id: true, description: true } } } },
    },
  });
  if (!run) throw notFound();
  return run;
}

export async function approveRun(actor: Actor, id: string) {
  const run = await db.billingRun.findUnique({ where: { id } });
  if (!run) throw notFound();
  if (run.status !== "DRAFT") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.billingRun.update({ where: { id }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
    await tx.invoice.updateMany({ where: { billingRunId: id, status: "DRAFT" }, data: { status: "PENDING_APPROVAL" } });
    await writeAudit(tx, { actorId: actor.id, entityType: "billing_run", entityId: id, action: "approve", after: { name: run.period } });
  });
  return { id };
}

/** Numbers are assigned here, in the transaction, so they're gapless and never reused. */
async function issueOne(tx: Tx, actor: Actor, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { client: { select: { contracts: { where: { status: "ACTIVE" }, orderBy: { startDate: "desc" }, take: 1, select: { paymentTermsDays: true } } } } } });
  if (!["DRAFT", "PENDING_APPROVAL"].includes(invoice.status)) throw invalid("errors.badTransition");
  const today = todayDate();
  await assertPeriodOpen(tx, invoice.periodStart ? periodOf(invoice.periodStart) : periodOf(today));
  const year = today.getUTCFullYear();
  const number = `INV-${year}-${pad(await nextNumber(tx, "INV", year), 5)}`;
  const terms = invoice.client.contracts[0]?.paymentTermsDays ?? 30;
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { number, status: "ISSUED", issueDate: today, dueDate: new Date(today.getTime() + terms * 86_400_000), issuedById: actor.id },
  });
  await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: invoiceId, action: "issue", after: { name: number, total: invoice.total.toString() } });
}

export async function issueRun(actor: Actor, id: string) {
  const run = await db.billingRun.findUnique({ where: { id }, include: { invoices: { where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] } }, select: { id: true } } } });
  if (!run) throw notFound();
  if (run.status !== "APPROVED") throw invalid("errors.runNotApproved");
  await db.$transaction(
    async (tx) => {
      for (const inv of run.invoices) await issueOne(tx, actor, inv.id);
      await tx.billingRun.update({ where: { id }, data: { status: "ISSUED" } });
      await writeAudit(tx, { actorId: actor.id, entityType: "billing_run", entityId: id, action: "issue", after: { name: run.period, invoices: run.invoices.length } });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  return { id, issued: run.invoices.length };
}

/** Cancelling frees the month for a fresh run and returns recoverable costs to "not billed yet". */
export async function cancelRun(actor: Actor, id: string) {
  const run = await db.billingRun.findUnique({ where: { id } });
  if (!run) throw notFound();
  if (run.status === "ISSUED" || run.status === "CANCELLED") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.expense.updateMany({ where: { billedLine: { invoice: { billingRunId: id } } }, data: { billedLineId: null } });
    await tx.invoice.deleteMany({ where: { billingRunId: id, number: null } });
    await tx.billingRun.update({ where: { id }, data: { status: "CANCELLED" } });
    await writeAudit(tx, { actorId: actor.id, entityType: "billing_run", entityId: id, action: "cancel", after: { name: run.period } });
  });
  return { id };
}

// ─────────────────────────── Invoices ───────────────────────────

export async function listInvoices(q: ListInvoicesQuery) {
  const scope = await getClientScope();
  const today = todayDate();
  const where: Prisma.InvoiceWhereInput = {
    ...clientIdFilter(scope),
    type: { not: "CREDIT_NOTE" },
    status: q.status,
    ...(q.client ? { clientId: q.client } : {}),
    ...(q.q ? { OR: [{ number: { contains: q.q, mode: "insensitive" } }, { client: { displayName: { contains: q.q, mode: "insensitive" } } }, { poNumber: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.view === "open" && !q.status ? { status: { in: ["DRAFT", "PENDING_APPROVAL", ...OPEN] } } : {}),
    ...(q.view === "overdue" ? { status: { in: [...OPEN] }, dueDate: { lt: today } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ dueDate: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } },
    }),
    db.invoice.count({ where }),
  ]);
  return { rows: rows.map((r) => ({ ...r, outstanding: outstandingOf(r) })), total, page: q.page };
}

/** Credit notes carry negative totals, so they reduce what's owed alongside payments. */
export function outstandingOf(i: { total: unknown; paymentAllocations: { amount: unknown }[]; creditNotes: { total: unknown }[] }) {
  const applied = [...i.paymentAllocations.map((p) => String(p.amount)), ...i.creditNotes.map((c) => money(String(c.total)).negated().toString())];
  return outstanding(String(i.total), applied).toFixed(2);
}

export async function getInvoice(id: string) {
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true, legalName: true, vatNumber: true, crNumber: true } },
      lines: { orderBy: { position: "asc" } },
      paymentAllocations: { include: { payment: { select: { id: true, receivedAt: true, method: true, reference: true, proofAttachmentId: true, reconciled: true } } } },
      creditNotes: { where: { status: { not: "VOID" } }, select: { id: true, number: true, total: true, issueDate: true, notes: true } },
      creditFor: { select: { id: true, number: true } },
      billingRun: { select: { id: true, period: true } },
      issuedBy: { select: { name: true } },
    },
  });
  if (!invoice) throw notFound();
  await assertAccess(invoice.clientId);
  return { ...invoice, outstanding: outstandingOf(invoice) };
}

export async function createInvoice(actor: Actor, input: InvoiceInput) {
  await assertAccess(input.clientId);
  const contract = await db.contract.findFirst({
    where: { clientId: input.clientId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    include: { rateCards: { where: activeOn() } },
  });
  let amount = input.amount;
  let description = input.description;
  // A service from the price list fills in whatever was left blank.
  if (input.serviceId) {
    const service = await db.servicePrice.findFirst({ where: { id: input.serviceId, active: true } });
    if (!service) throw invalid("errors.validation", [{ path: "serviceId", message: "validation.required" }]);
    amount ??= service.price.toString();
    description ??= service.nameAr && (await getLocale()) === "ar" ? service.nameAr : service.nameEn;
  }
  if (!description) throw invalid("errors.validation", [{ path: "description", message: "validation.required" }]);
  // A renewal defaults to the fee agreed in the client's contract, per employee.
  if (input.type === "SPONSORSHIP_RENEWAL" && !amount) {
    const fee = contract?.rateCards[0]?.sponsorshipRenewalFee;
    if (!fee) throw invalid("errors.validation", [{ path: "amount", message: "validation.noRenewalFee" }]);
    amount = fee.toString();
  }
  if (!amount) throw invalid("errors.validation", [{ path: "amount", message: "validation.required" }]);
  const qty = input.quantity ?? 1;
  const lineAmount = round2(money(amount).times(qty));
  const vatRate = contract?.vatRate.toString() ?? "0.15";
  const totals = invoiceTotals([lineAmount], vatRate);
  return db.$transaction(async (tx) => {
    const row = await tx.invoice.create({
      data: {
        clientId: input.clientId,
        type: input.type,
        currency: contract?.currency ?? "SAR",
        vatRate,
        subtotal: totals.subtotal.toString(),
        vatAmount: totals.vat.toString(),
        total: totals.total.toString(),
        poNumber: input.poNumber,
        notes: input.notes,
        lines: { create: { position: 0, description, sourceType: "MANUAL", quantity: qty, unitAmount: amount!, amount: lineAmount.toString() } },
      },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: row.id, action: "create", after: { name: description, total: totals.total.toString() } });
    return { id: row.id };
  });
}

async function recalcDraft(tx: Tx, invoiceId: string, vatRate: string) {
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { amount: true } });
  const totals = invoiceTotals(lines.map((l) => l.amount.toString()), vatRate);
  await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal: totals.subtotal.toString(), vatAmount: totals.vat.toString(), total: totals.total.toString() } });
}

async function loadDraft(id: string) {
  const invoice = await db.invoice.findUnique({ where: { id }, select: { status: true, vatRate: true, clientId: true, _count: { select: { lines: true } } } });
  if (!invoice) throw notFound();
  await assertAccess(invoice.clientId);
  if (!["DRAFT", "PENDING_APPROVAL"].includes(invoice.status)) throw invalid("errors.invoiceLocked");
  return invoice;
}

export async function addLine(actor: Actor, id: string, input: { description: string; amount: string }) {
  const invoice = await loadDraft(id);
  return db.$transaction(async (tx) => {
    const last = await tx.invoiceLine.aggregate({ where: { invoiceId: id }, _max: { position: true } });
    const line = await tx.invoiceLine.create({ data: { invoiceId: id, position: (last._max.position ?? -1) + 1, description: input.description, sourceType: "MANUAL", unitAmount: input.amount, amount: input.amount } });
    await recalcDraft(tx, id, invoice.vatRate.toString());
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: "line_add", after: { name: input.description, amount: input.amount } });
    return { id: line.id };
  });
}

export async function removeLine(actor: Actor, id: string, lineId: string) {
  const invoice = await loadDraft(id);
  return db.$transaction(async (tx) => {
    const line = await tx.invoiceLine.findFirst({ where: { id: lineId, invoiceId: id } });
    if (!line) throw notFound();
    await tx.expense.updateMany({ where: { billedLineId: lineId }, data: { billedLineId: null } });
    await tx.invoiceLine.delete({ where: { id: lineId } });
    await recalcDraft(tx, id, invoice.vatRate.toString());
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: "line_remove", after: { name: line.description, amount: line.amount.toString() } });
    return { id };
  });
}

export async function updateInvoiceMeta(actor: Actor, id: string, input: { poNumber?: string | null; notes?: string | null }) {
  const invoice = await db.invoice.findUnique({ where: { id }, select: { clientId: true } });
  if (!invoice) throw notFound();
  await assertAccess(invoice.clientId);
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { poNumber: input.poNumber, notes: input.notes } });
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: "update", after: { poNumber: input.poNumber } });
  });
  return { id };
}

export async function issueInvoice(actor: Actor, id: string) {
  const invoice = await loadDraft(id);
  if (!invoice._count.lines) throw invalid("errors.invoiceEmpty");
  await db.$transaction((tx) => issueOne(tx, actor, id));
  return { id };
}

/** Issued numbers are never reused or deleted: voiding keeps the record, marked void. */
export async function voidInvoice(actor: Actor, id: string) {
  const invoice = await db.invoice.findUnique({ where: { id }, include: { paymentAllocations: { select: { id: true } } } });
  if (!invoice) throw notFound();
  await assertAccess(invoice.clientId);
  if (invoice.status === "VOID" || invoice.paymentAllocations.length) throw invalid("errors.invoiceHasPayments");
  // Voiding would change a finished month's revenue. A credit note lands in the current month instead.
  if (invoice.number && (invoice.periodStart ?? invoice.issueDate)) await assertPeriodOpen(db, periodOf((invoice.periodStart ?? invoice.issueDate)!));
  await db.$transaction(async (tx) => {
    await tx.expense.updateMany({ where: { billedLine: { invoiceId: id } }, data: { billedLineId: null } });
    await tx.invoice.update({ where: { id }, data: { status: "VOID" } });
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: "void", before: { status: invoice.status }, after: { status: "VOID" } });
  });
  return { id };
}

export async function setDisputed(actor: Actor, id: string, disputed: boolean) {
  const invoice = await db.invoice.findUnique({ where: { id }, include: { paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } } });
  if (!invoice) throw notFound();
  await assertAccess(invoice.clientId);
  if (!OPEN.includes(invoice.status as (typeof OPEN)[number])) throw invalid("errors.badTransition");
  const status = disputed ? "DISPUTED" : paymentState(invoice.total.toString(), invoice.paymentAllocations.map((p) => p.amount.toString()));
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status } });
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: disputed ? "dispute" : "undispute", before: { status: invoice.status }, after: { status } });
  });
  return { id };
}

/** Moves the invoice between issued, part paid and paid, counting credit notes as settled money. */
async function refreshPaymentStatus(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } } });
  if (invoice.status === "DISPUTED") return;
  const settled = [...invoice.paymentAllocations.map((p) => p.amount.toString()), ...invoice.creditNotes.map((c) => money(c.total.toString()).negated().toString())];
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: paymentState(invoice.total.toString(), settled) } });
}

export async function creditInvoice(actor: Actor, id: string, input: { amount: string; reason: string }) {
  const invoice = await getInvoice(id);
  if (!OPEN.includes(invoice.status as (typeof OPEN)[number]) && invoice.status !== "PAID") throw invalid("errors.badTransition");
  await assertPeriodOpen(db, periodOf(todayDate()));
  const net = money(input.amount);
  const vat = vatOf(net, invoice.vatRate.toString());
  if (net.plus(vat).greaterThan(money(invoice.outstanding))) throw invalid("errors.validation", [{ path: "amount", message: "validation.creditTooHigh" }]);
  return db.$transaction(async (tx) => {
    const today = todayDate();
    const year = today.getUTCFullYear();
    const number = `CN-${year}-${pad(await nextNumber(tx, "CN", year), 5)}`;
    const note = await tx.invoice.create({
      data: {
        number,
        clientId: invoice.clientId,
        type: "CREDIT_NOTE",
        creditForId: id,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        issueDate: today,
        currency: invoice.currency,
        vatRate: invoice.vatRate,
        subtotal: net.negated().toString(),
        vatAmount: vat.negated().toString(),
        total: net.plus(vat).negated().toString(),
        status: "ISSUED",
        issuedById: actor.id,
        notes: input.reason,
        lines: { create: { position: 0, description: input.reason, sourceType: "MANUAL", unitAmount: net.negated().toString(), amount: net.negated().toString() } },
      },
    });
    await refreshPaymentStatus(tx, id);
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: id, action: "credit", after: { name: number, amount: input.amount, reason: input.reason } });
    return { id: note.id };
  });
}

// ─────────────────────────── Payments ───────────────────────────

/** Applies to the chosen invoice, otherwise oldest first. Anything left stays on account. */
export async function recordPayment(actor: Actor, input: PaymentInput) {
  await assertAccess(input.clientId);
  if (money(input.amount).lessThanOrEqualTo(0)) throw invalid("errors.validation", [{ path: "amount", message: "validation.money" }]);
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { clientId: input.clientId, receivedAt: dateOnly(input.receivedAt), amount: input.amount, method: input.method, reference: input.reference, proofAttachmentId: input.proofAttachmentId },
    });
    const invoices = await tx.invoice.findMany({
      where: { clientId: input.clientId, status: { in: [...OPEN] }, type: { not: "CREDIT_NOTE" }, ...(input.invoiceId ? { id: input.invoiceId } : {}) },
      orderBy: { dueDate: "asc" },
      include: { paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } },
    });
    if (input.invoiceId && invoices.length === 0) throw invalid("errors.validation", [{ path: "invoiceId", message: "errors.badTransition" }]);
    let left = money(input.amount);
    let appliedTotal = money(0);
    for (const inv of invoices) {
      if (left.lessThanOrEqualTo(0)) break;
      const due = money(outstandingOf(inv));
      if (due.lessThanOrEqualTo(0)) continue;
      const portion = left.lessThan(due) ? left : due;
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: inv.id, amount: portion.toString() } });
      await refreshPaymentStatus(tx, inv.id);
      left = left.minus(portion);
      appliedTotal = appliedTotal.plus(portion);
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "payment", entityId: payment.id, action: "create", after: { amount: input.amount, applied: appliedTotal.toFixed(2), reference: input.reference } });
    return { id: payment.id, applied: appliedTotal.toFixed(2), unapplied: left.toFixed(2) };
  });
}

/** Puts a payment's unapplied balance against newly issued invoices. */
export async function applyOnAccount(actor: Actor, paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { allocations: { select: { amount: true } } } });
  if (!payment) throw notFound();
  await assertAccess(payment.clientId);
  let left = money(payment.amount.toString()).minus(add(...payment.allocations.map((a) => a.amount.toString())));
  if (left.lessThanOrEqualTo(0)) return { id: paymentId, applied: "0.00" };
  const start = left;
  await db.$transaction(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { clientId: payment.clientId, status: { in: [...OPEN] }, type: { not: "CREDIT_NOTE" } },
      orderBy: { dueDate: "asc" },
      include: { paymentAllocations: { select: { amount: true, paymentId: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } } },
    });
    for (const inv of invoices) {
      if (left.lessThanOrEqualTo(0)) break;
      if (inv.paymentAllocations.some((p) => p.paymentId === paymentId)) continue;
      const due = money(outstandingOf(inv));
      if (due.lessThanOrEqualTo(0)) continue;
      const portion = left.lessThan(due) ? left : due;
      await tx.paymentAllocation.create({ data: { paymentId, invoiceId: inv.id, amount: portion.toString() } });
      await refreshPaymentStatus(tx, inv.id);
      left = left.minus(portion);
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "payment", entityId: paymentId, action: "apply", after: { amount: start.minus(left).toFixed(2) } });
  });
  return { id: paymentId, applied: start.minus(left).toFixed(2) };
}

export async function setReconciled(actor: Actor, id: string, reconciled: boolean) {
  const payment = await db.payment.findUnique({ where: { id }, select: { clientId: true } });
  if (!payment) throw notFound();
  await assertAccess(payment.clientId);
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { reconciled } });
    await writeAudit(tx, { actorId: actor.id, entityType: "payment", entityId: id, action: reconciled ? "reconcile" : "unreconcile" });
  });
  return { id };
}

export async function listPayments(q: { page: number; q?: string; client?: string }) {
  const scope = await getClientScope();
  const where: Prisma.PaymentWhereInput = {
    ...clientIdFilter(scope),
    ...(q.client ? { clientId: q.client } : {}),
    ...(q.q ? { OR: [{ reference: { contains: q.q, mode: "insensitive" } }, { client: { displayName: { contains: q.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { client: { select: { id: true, displayName: true } }, allocations: { include: { invoice: { select: { id: true, number: true } } } } },
    }),
    db.payment.count({ where }),
  ]);
  return { rows, total, page: q.page };
}

// ─────────────────────────── Receivables ───────────────────────────

/** Totals for the money page, limited to what this person may see. Optional client narrows it. */
export async function receivables(clientIds?: string[]) {
  const scope = await getClientScope();
  const ids = scope.kind === "all" ? clientIds : scope.clientIds.filter((c) => !clientIds || clientIds.includes(c));
  const filter = ids ? { clientId: { in: ids } } : {};
  const today = todayDate();
  const { start } = periodBounds(periodOf(today));
  const [open, collected, missingPo, unbilled, unreconciled] = await Promise.all([
    db.invoice.findMany({
      where: { ...filter, status: { in: [...OPEN] }, type: { not: "CREDIT_NOTE" } },
      include: { paymentAllocations: { select: { amount: true } }, creditNotes: { where: { status: { not: "VOID" } }, select: { total: true } }, client: { select: { id: true, displayName: true } } },
    }),
    db.payment.aggregate({ where: { ...filter, receivedAt: { gte: start } }, _sum: { amount: true } }),
    db.invoice.count({ where: { ...filter, poRequired: true, poNumber: null, status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }),
    db.expense.count({ where: { ...filter, recoverable: true, status: "APPROVED", billedLineId: null } }),
    db.payment.count({ where: { ...filter, reconciled: false } }),
  ]);
  const rows = open.map((i) => ({ dueDate: i.dueDate ?? today, outstanding: outstandingOf(i), client: i.client }));
  const aging = agingSummary(rows, today);
  const total = add(...rows.map((r) => r.outstanding));
  const overdue = add(...rows.filter((r) => r.dueDate < today).map((r) => r.outstanding));
  return {
    total: total.toFixed(2),
    overdue: overdue.toFixed(2),
    collectedMonth: collected._sum.amount?.toString() ?? "0",
    aging: { CURRENT: aging.CURRENT.toFixed(2), D1_30: aging.D1_30.toFixed(2), D31_60: aging.D31_60.toFixed(2), D60_PLUS: aging.D60_PLUS.toFixed(2) },
    missingPo,
    unbilled,
    unreconciled,
    rows,
  };
}
