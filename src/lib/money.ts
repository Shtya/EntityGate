/**
 * Money arithmetic for EntityGate.
 *
 * Rules (docs/PLAN.md §3.1):
 *  - Never use JS `number` for money. Everything goes through Decimal.
 *  - Amounts are stored as NUMERIC(14,2); rounding is ROUND_HALF_UP to 2 dp.
 *  - Invoice lines are rounded individually; totals are the sum of rounded lines.
 *  - VAT is computed on the rounded subtotal, then rounded.
 */
import Decimal from "decimal.js";
import { intlLocale } from "@/i18n/config";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value | { toString(): string };
export type Money = Decimal;

export function money(value: MoneyInput | null | undefined): Money {
  if (value === null || value === undefined || value === "") return new D(0);
  const v = typeof value === "object" && !(value instanceof Decimal) ? value.toString() : value;
  const d = new D(v as Decimal.Value);
  if (!d.isFinite()) throw new RangeError(`Invalid money value: ${String(value)}`);
  return d;
}

/** Round to 2 decimal places, half-up (banker-free, accounting standard here). */
export function round2(value: MoneyInput): Money {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function add(...values: MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(money(v)), new D(0));
}

export function sub(a: MoneyInput, b: MoneyInput): Money {
  return money(a).minus(money(b));
}

export function mul(a: MoneyInput, b: MoneyInput): Money {
  return money(a).times(money(b));
}

/** Sum of values each rounded to 2dp first — the invoice-total rule. */
export function sumRounded(values: MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(round2(v)), new D(0));
}

/**
 * Prorate a monthly amount by days active in the period.
 * Result is NOT rounded — round once at the line level.
 */
export function prorate(monthly: MoneyInput, daysActive: number, daysInPeriod: number): Money {
  if (!Number.isInteger(daysActive) || !Number.isInteger(daysInPeriod)) {
    throw new RangeError("prorate expects integer day counts");
  }
  if (daysInPeriod <= 0) throw new RangeError("daysInPeriod must be > 0");
  if (daysActive < 0 || daysActive > daysInPeriod) {
    throw new RangeError(`daysActive (${daysActive}) must be within 0..${daysInPeriod}`);
  }
  if (daysActive === daysInPeriod) return money(monthly);
  return money(monthly).times(daysActive).dividedBy(daysInPeriod);
}

/** VAT on an already-rounded subtotal. rate is a fraction: 0.15 = 15%. */
export function vatOf(subtotal: MoneyInput, rate: MoneyInput): Money {
  return round2(round2(subtotal).times(money(rate)));
}

/** Margin percentage as a fraction (0.14 = 14%). Returns null when revenue is zero. */
export function marginRatio(revenue: MoneyInput, cost: MoneyInput): Decimal | null {
  const r = money(revenue);
  if (r.isZero()) return null;
  return r.minus(money(cost)).dividedBy(r);
}

export function isZero(v: MoneyInput) {
  return money(v).isZero();
}

export function eq(a: MoneyInput, b: MoneyInput) {
  return money(a).equals(money(b));
}

/** Serialize for JSON/API transport — always a fixed 2dp string, never a float. */
export function toApi(v: MoneyInput): string {
  return round2(v).toFixed(2);
}

// ───────────── Formatting (display only) ─────────────

const nf = new Map<string, Intl.NumberFormat>();
function fmt(locale: string, opts: Intl.NumberFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    nf.set(key, f);
  }
  return f;
}

/**
 * Format money for display. Uses the string representation to avoid float drift
 * for values beyond Number precision; Intl only receives already-rounded values.
 */
export function formatMoney(
  v: MoneyInput,
  { currency = "SAR", compact = false, locale = "en", accounting = false } = {},
): string {
  const d = round2(v);
  const n = d.toNumber();
  const body = fmt(locale === "ar" ? intlLocale(locale) : "en-US", {
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(Math.abs(n));
  const unit = locale === "ar" && currency === "SAR" ? "ر.س" : currency;
  const out = locale === "ar" ? `${body} ${unit}` : `${unit} ${body}`;
  if (d.isNegative()) return accounting ? `(${out})` : `−${out}`;
  return out;
}

export function formatPercent(ratio: Decimal | number | null, digits = 1): string {
  if (ratio === null) return "—";
  const n = typeof ratio === "number" ? ratio : ratio.toNumber();
  return `${(n * 100).toFixed(digits)}%`;
}

export { D as Decimal };
