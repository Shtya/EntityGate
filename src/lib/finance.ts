/**
 * Financial calculations, as pure functions over money.ts. The billing (M5) and finance (M6)
 * modules will call these, so one formula backs every screen and report.
 *
 * Revenue and margin definitions still need Finance's sign-off (BR-06, open questions Q1, Q2, Q4).
 * Revenue here is excluding VAT, because VAT is collected for ZATCA and isn't income.
 */
import { overlapDays, periodBounds } from "./dates";
import { add, marginRatio, money, prorate, round2, sub, sumRounded, vatOf, type Money, type MoneyInput } from "./money";

export type BillingModel = "COST_PLUS_PERCENT" | "FIXED_PER_HEAD" | "COST_PLUS_FIXED";

export interface InvoiceTotals {
  subtotal: Money;
  vat: Money;
  total: Money;
}

/** Lines round individually; the subtotal is their sum; VAT applies to that subtotal. */
export function invoiceTotals(lineAmounts: MoneyInput[], vatRate: MoneyInput): InvoiceTotals {
  const subtotal = sumRounded(lineAmounts);
  const vat = vatOf(subtotal, vatRate);
  return { subtotal, vat, total: subtotal.plus(vat) };
}

export interface HeadInput {
  /** Monthly cost basis of one employee: salary, allowances, GOSI, insurance. */
  monthlyCost: MoneyInput;
  daysActive: number;
  daysInPeriod: number;
}

export interface RateInput {
  model: BillingModel;
  feePercent?: MoneyInput | null; // fraction: 0.08 = 8%
  feePerHead?: MoneyInput | null;
  feeFixedMonthly?: MoneyInput | null;
}

/** What one prorated employee costs us and what we bill for them. FIXED account fees are separate. */
export function billHead(head: HeadInput, rate: RateInput): { cost: Money; fee: Money; amount: Money } {
  const cost = round2(prorate(head.monthlyCost, head.daysActive, head.daysInPeriod));
  let fee = money(0);
  if (rate.model === "COST_PLUS_PERCENT") fee = round2(cost.times(money(rate.feePercent)));
  if (rate.model === "FIXED_PER_HEAD") fee = round2(prorate(money(rate.feePerHead), head.daysActive, head.daysInPeriod));
  return { cost, fee, amount: cost.plus(fee) };
}

export interface MonthlyBill {
  lines: { cost: Money; fee: Money; amount: Money }[];
  accountFee: Money;
  cost: Money;
  subtotal: Money;
  vat: Money;
  total: Money;
}

export function monthlyBill(heads: HeadInput[], rate: RateInput, recoverables: MoneyInput[], vatRate: MoneyInput): MonthlyBill {
  const lines = heads.map((h) => billHead(h, rate));
  const accountFee = rate.model === "COST_PLUS_FIXED" && heads.length > 0 ? round2(money(rate.feeFixedMonthly)) : money(0);
  const { subtotal, vat, total } = invoiceTotals([...lines.map((l) => l.amount), accountFee, ...recoverables], vatRate);
  return { lines, accountFee, cost: add(...lines.map((l) => l.cost), ...recoverables.map(round2)), subtotal, vat, total };
}

/** UAT-05: outstanding = invoice total minus applied payments. Overpayment shows as negative credit. */
export function outstanding(total: MoneyInput, applied: MoneyInput[]): Money {
  return sub(total, sumRounded(applied));
}

export type InvoiceState = "ISSUED" | "PARTIALLY_PAID" | "PAID";

export function paymentState(total: MoneyInput, applied: MoneyInput[]): InvoiceState {
  const paid = sumRounded(applied);
  if (paid.isZero()) return "ISSUED";
  return paid.greaterThanOrEqualTo(money(total)) ? "PAID" : "PARTIALLY_PAID";
}

export type AgingBucket = "CURRENT" | "D1_30" | "D31_60" | "D60_PLUS";

/** Days past due on calendar dates. Due today is still current. */
export function agingBucket(dueDate: Date, today: Date): AgingBucket {
  const days = Math.round((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (days <= 0) return "CURRENT";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  return "D60_PLUS";
}

export interface AgedInvoice {
  dueDate: Date;
  outstanding: MoneyInput;
}

export function agingSummary(invoices: AgedInvoice[], today: Date): Record<AgingBucket, Money> {
  const out: Record<AgingBucket, Money> = { CURRENT: money(0), D1_30: money(0), D31_60: money(0), D60_PLUS: money(0) };
  for (const inv of invoices) {
    const bucket = agingBucket(inv.dueDate, today);
    out[bucket] = out[bucket].plus(round2(inv.outstanding));
  }
  return out;
}

export interface PnlInput {
  revenue: MoneyInput[]; // issued invoice subtotals, excluding VAT
  creditNotes?: MoneyInput[]; // positive amounts, reduce revenue
  payroll?: MoneyInput[];
  directExpenses?: MoneyInput[];
  overhead?: MoneyInput[];
}

export interface Pnl {
  revenue: Money;
  directCost: Money;
  contribution: Money;
  /** Fraction, or null when revenue is zero. */
  contributionMargin: ReturnType<typeof marginRatio>;
  overhead: Money;
  netProfit: Money;
  netMargin: ReturnType<typeof marginRatio>;
}

/** Revenue − direct costs = contribution; contribution − overhead = net profit (PLAN §2.4). */
export function profitAndLoss(input: PnlInput): Pnl {
  const revenue = sub(sumRounded(input.revenue), sumRounded(input.creditNotes ?? []));
  const directCost = add(sumRounded(input.payroll ?? []), sumRounded(input.directExpenses ?? []));
  const contribution = revenue.minus(directCost);
  const overhead = sumRounded(input.overhead ?? []);
  const netProfit = contribution.minus(overhead);
  return {
    revenue,
    directCost,
    contribution,
    contributionMargin: marginRatio(revenue, directCost),
    overhead,
    netProfit,
    netMargin: marginRatio(revenue, directCost.plus(overhead)),
  };
}

/** Calendar days after a date; negative before it. */
export function daysPastDue(date: Date, today: Date): number {
  return Math.round((today.getTime() - date.getTime()) / 86_400_000);
}

export type ClientHealth = "STRONG" | "WATCH" | "AT_RISK";

export const HEALTH_RULES = { atRiskOverdueDays: 30, watchMarginBelow: "0.05" };

/**
 * Over 30 days late is at risk. Anything late, a breached case, or a thin margin means watch it.
 * These thresholds are a starting point until the client defines them (open question Q10).
 */
export function clientHealth(input: { maxOverdueDays: number; breachedCases: number; revenue: MoneyInput; cost: MoneyInput }): ClientHealth {
  if (input.maxOverdueDays > HEALTH_RULES.atRiskOverdueDays) return "AT_RISK";
  const margin = marginRatio(input.revenue, input.cost);
  if (input.maxOverdueDays > 0 || input.breachedCases > 0 || (margin !== null && margin.lessThan(HEALTH_RULES.watchMarginBelow))) return "WATCH";
  return "STRONG";
}

/** Monthly cost basis of one pay record. */
export function monthlyCost(c: { basic: unknown; housing: unknown; transport: unknown; other: unknown; gosiEmployer: unknown; insuranceMonthly: unknown }): Money {
  return add(String(c.basic), String(c.housing), String(c.transport), String(c.other), String(c.gosiEmployer), String(c.insuranceMonthly));
}

export interface PayRate {
  from: Date;
  to: Date | null;
  monthly: MoneyInput;
}

/**
 * One placement's bill for a month. A raise mid-month splits by day, and pay is only counted
 * for days the employee was actually on this client.
 */
export function allocationBill(allocFrom: Date, allocTo: Date | null, pay: PayRate[], period: string, rate: RateInput): { daysActive: number; cost: Money; fee: Money; amount: Money } {
  const { days } = periodBounds(period);
  const daysActive = overlapDays(allocFrom, allocTo, period);
  if (daysActive === 0) return { daysActive: 0, cost: money(0), fee: money(0), amount: money(0) };
  let rawCost = money(0);
  for (const p of pay) {
    const from = p.from > allocFrom ? p.from : allocFrom;
    const to = p.to === null ? allocTo : allocTo === null || p.to < allocTo ? p.to : allocTo;
    if (to !== null && to <= from) continue;
    rawCost = rawCost.plus(prorate(p.monthly, overlapDays(from, to, period), days));
  }
  const cost = round2(rawCost);
  let fee = money(0);
  if (rate.model === "COST_PLUS_PERCENT") fee = round2(cost.times(money(rate.feePercent)));
  if (rate.model === "FIXED_PER_HEAD") fee = round2(prorate(money(rate.feePerHead), daysActive, days));
  return { daysActive, cost, fee, amount: cost.plus(fee) };
}
