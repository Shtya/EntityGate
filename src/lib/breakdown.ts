/**
 * The per-employee invoice breakdown from the client's own sheet (feedback, 17–18 Nov 2026).
 * Pure functions over money.ts, so billing, edits and the Excel export all use one formula.
 *
 * Every column of the sheet is a "service". Each client sets, per service: whether it applies at
 * all, which invoice it goes on (the monthly payroll invoice or a separate expenses invoice), and
 * its own fee (a percentage of the amount, or a fixed amount). Without a setting, a service is on,
 * goes on the payroll invoice, and takes the contract's fee.
 */
import { add, money, round2, type Money, type MoneyInput } from "./money";

/** The Saudi riyal is pegged to the US dollar at this rate; the client's sheet uses it for its USD row. */
export const SAR_PER_USD = "3.75";

/** Standing monthly charges, billed in proportion to the days worked. */
export const STANDING_CHARGES = ["medical", "gosi", "iqamaRenewal", "exitReentry", "flightTicket", "iqamaTransfer", "adminFee", "dependantsFees", "ajeer"] as const;
/** One-off charges for the month, billed in full. */
export const ONE_OFF_CHARGES = ["sponsorshipTransfer", "newVisa", "payout", "other"] as const;
export type StandingCharge = (typeof STANDING_CHARGES)[number];
export type OneOffCharge = (typeof ONE_OFF_CHARGES)[number];
export type Charge = StandingCharge | OneOffCharge;

/** The sheet's direct-cost columns. Deductions belong to salary, so they follow its rule. */
export const DIRECT_SERVICES = ["salary", "gasSupport", "kpi"] as const;
/** The sheet's indirect-cost columns, in the sheet's order. */
export const INDIRECT_SERVICES = ["eos", ...STANDING_CHARGES, ...ONE_OFF_CHARGES] as const;
export const SERVICES = [...DIRECT_SERVICES, ...INDIRECT_SERVICES] as const;
export type Service = (typeof SERVICES)[number];
export const isDirect = (s: Service) => (DIRECT_SERVICES as readonly string[]).includes(s);

export type InvoicePart = "PAYROLL" | "EXPENSES";
export const INVOICE_PARTS = ["PAYROLL", "EXPENSES"] as const;

/** One client's rule for one service. */
export interface ServiceRule {
  enabled?: boolean;
  part?: InvoicePart;
  /** A percentage (fraction: 0.11 = 11%) of the service's amount, or a fixed amount per employee per month. */
  fee?: { type: "PERCENT" | "FIXED"; value: MoneyInput } | null;
}
export type ServiceRules = Partial<Record<Service, ServiceRule>>;

export type FeeModel = "COST_PLUS_PERCENT" | "FIXED_PER_HEAD" | "COST_PLUS_FIXED" | "PER_DAY";

export interface BreakdownInput {
  /** Monthly take-home salary. */
  salary: MoneyInput;
  /** Days billed on the client's 30-day month: a full month is 30 whatever the calendar says. */
  workdays: MoneyInput;
  deductions?: MoneyInput | null;
  gasSupport?: MoneyInput | null;
  kpi?: MoneyInput | null;
  /** Monthly amounts, before proration. */
  charges?: Partial<Record<Charge, MoneyInput | null>>;
  /** End-of-service accrual: half a month's salary per year worked. */
  billEos: boolean;
  /** The contract's fee terms, used for any service without its own fee. */
  fee: {
    model: FeeModel;
    /** Fraction on direct costs: 0.11 = 11%. */
    directRate?: MoneyInput | null;
    /** Fraction on indirect costs; null means the same as the direct rate. */
    indirectRate?: MoneyInput | null;
    perHead?: MoneyInput | null;
    perDay?: MoneyInput | null;
  };
  /** This client's per-service settings. */
  rules?: ServiceRules | null;
  /** Which invoice this row is for. Defaults to the payroll invoice. */
  part?: InvoicePart;
}

export interface Breakdown {
  /** The services that appear on this invoice: on for the client, and routed to this part. */
  included: Service[];
  /** Each service's amount as billed this month, after proration; 0 when not included. */
  amounts: Record<Service, Money>;
  directTotal: Money;
  eos: Money;
  /** Each charge as billed this month; 0 when not included. */
  billed: Record<Charge, Money>;
  indirectTotal: Money;
  /** Direct + indirect, rounded: what the employee costs before our fee. */
  cost: Money;
  serviceFee: Money;
  /** The line amount, rounded to the halala. */
  total: Money;
}

export const ruleFor = (rules: ServiceRules | null | undefined, s: Service): Required<Pick<ServiceRule, "enabled" | "part">> & Pick<ServiceRule, "fee"> => ({
  enabled: rules?.[s]?.enabled ?? true,
  part: rules?.[s]?.part ?? "PAYROLL",
  fee: rules?.[s]?.fee ?? null,
});

/** The services a client's invoice of this kind shows, in the sheet's order. */
export function servicesOn(rules: ServiceRules | null | undefined, part: InvoicePart, billEos = true): Service[] {
  return SERVICES.filter((s) => (s !== "eos" || billEos) && ruleFor(rules, s).enabled && ruleFor(rules, s).part === part);
}

/**
 * One row of the client's "Invoice Breakdown":
 *   Direct   = salary ÷ 30 × workdays − deductions + gas support + KPI
 *   Indirect = EOS (salary ÷ 2 ÷ 12) + standing charges, both × workdays ÷ 30, + one-off charges
 *   Fee      = each service's own fee (a % of its amount or a fixed amount), or the contract's
 *              rate on direct or indirect costs; per head and per day go on the payroll invoice
 * Columns keep full precision and only the totals round, so it matches the sheet to the halala.
 */
export function employeeBreakdown(i: BreakdownInput): Breakdown {
  const part = i.part ?? "PAYROLL";
  const days = money(i.workdays);
  const share = days.dividedBy(30);
  const salary = money(i.salary);
  const raw: Record<Service, Money> = {
    salary: salary.dividedBy(30).times(days).minus(money(i.deductions)),
    gasSupport: money(i.gasSupport),
    kpi: money(i.kpi),
    eos: i.billEos ? salary.dividedBy(24).times(share) : money(0),
  } as Record<Service, Money>;
  for (const k of STANDING_CHARGES) raw[k] = money(i.charges?.[k]).times(share);
  for (const k of ONE_OFF_CHARGES) raw[k] = money(i.charges?.[k]);

  const included = servicesOn(i.rules, part, i.billEos);
  const amounts = Object.fromEntries(SERVICES.map((s) => [s, included.includes(s) ? raw[s] : money(0)])) as Record<Service, Money>;
  const directTotal = add(...DIRECT_SERVICES.map((s) => amounts[s]));
  const indirectTotal = add(...INDIRECT_SERVICES.map((s) => amounts[s]));

  const f = i.fee;
  let fee = money(0);
  for (const s of included) {
    const own = ruleFor(i.rules, s).fee;
    const amount = amounts[s];
    if (own) {
      // A fixed fee is charged when the service is actually provided that month.
      if (own.type === "PERCENT") fee = fee.plus(amount.times(money(own.value)));
      else if (!amount.isZero()) fee = fee.plus(money(own.value));
    } else if (f.model === "COST_PLUS_PERCENT") {
      fee = fee.plus(amount.times(money(isDirect(s) ? f.directRate : (f.indirectRate ?? f.directRate))));
    }
  }
  // Per-head and per-day fees are for the person, so they go once, on the payroll invoice.
  if (part === "PAYROLL" && f.model === "FIXED_PER_HEAD") fee = fee.plus(money(f.perHead).times(share));
  if (part === "PAYROLL" && f.model === "PER_DAY") fee = fee.plus(money(f.perDay).times(days));

  const billed = Object.fromEntries([...STANDING_CHARGES, ...ONE_OFF_CHARGES].map((k) => [k, amounts[k]])) as Record<Charge, Money>;
  const cost = round2(directTotal.plus(indirectTotal));
  const total = round2(directTotal.plus(indirectTotal).plus(fee));
  return { included, amounts, directTotal, eos: amounts.eos, billed, indirectTotal, cost, serviceFee: total.minus(cost), total };
}

/** Days to bill for a placement: 30 for a whole month, otherwise the days actually on the client. */
export function billedWorkdays(daysActive: number, daysInMonth: number): number {
  return daysActive >= daysInMonth ? 30 : Math.min(30, daysActive);
}
