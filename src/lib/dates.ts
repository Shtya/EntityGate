/**
 * Date helpers. DB stores UTC timestamps and plain DATE columns; business logic
 * (overdue, "today", periods) is evaluated in the company timezone (BR-05).
 */
import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays } from "date-fns";
import { intlLocale } from "@/i18n/config";

// One constant on server and client, so server-rendered dates hydrate identically.
export const APP_TZ = "Asia/Riyadh";

/** Today's calendar date in the company timezone, as a UTC-midnight Date (matches @db.Date). */
export function todayDate(now: Date = new Date()): Date {
  const z = new TZDate(now.getTime(), APP_TZ);
  return new Date(Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()));
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(s: string): boolean {
  return PERIOD_RE.test(s);
}

export function parsePeriod(period: string): { year: number; month: number } {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new RangeError(`Invalid period "${period}" (expected YYYY-MM)`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Half-open [start, end) bounds of a period as UTC-midnight dates. */
export function periodBounds(period: string): { start: Date; end: Date; days: number } {
  const { year, month } = parsePeriod(period);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end, days: differenceInCalendarDays(end, start) };
}

/**
 * Days a half-open range [from, to) overlaps a period. `to = null` means open-ended.
 * Used for prorating allocations in the billing run.
 */
export function overlapDays(from: Date, to: Date | null, period: string): number {
  const { start, end } = periodBounds(period);
  const s = from > start ? from : start;
  const e = to === null || to > end ? end : to;
  const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
  return Math.max(0, days);
}

/** Calendar date (UTC midnight) from "YYYY-MM-DD". */
export function parseDateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RangeError(`Invalid date "${s}" (expected YYYY-MM-DD)`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new RangeError(`Invalid date "${s}"`);
  return d;
}

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type DateStyle = "date" | "dateTime" | "long";

const DATE_FORMATS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  dateTime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
};

export function formatDate(d: Date | string, locale = "en", style: DateStyle = "date"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(intlLocale(locale), { ...DATE_FORMATS[style], timeZone: APP_TZ }).format(date);
}

export function formatDateTime(d: Date | string, locale = "en"): string {
  return formatDate(d, locale, "dateTime");
}

/** Greeting key based on the company-timezone hour. */
export function greetingKey(now: Date = new Date()): "morning" | "afternoon" | "evening" {
  const h = new TZDate(now.getTime(), APP_TZ).getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const WORK_START = 8;
const WORK_END = 17;
/** Friday and Saturday are the Saudi weekend. */
const isWeekend = (dayOfWeek: number) => dayOfWeek === 5 || dayOfWeek === 6;

/**
 * Adds working hours (Sunday to Thursday, 08:00 to 17:00 Riyadh, skipping holidays). BR-05.
 * The working day is an assumption until Operations confirms it (open decision OD-06).
 */
export function addWorkingHours(from: Date, hours: number, holidays: Date[] = []): Date {
  const off = new Set(holidays.map(toDateOnly));
  // Riyadh is a fixed UTC+3 with no daylight saving, so the arithmetic stays simple.
  const OFFSET = 3 * 3_600_000;
  let local = new Date(from.getTime() + OFFSET);
  let remaining = hours * 3_600_000;
  while (remaining > 0) {
    const closed = isWeekend(local.getUTCDay()) || off.has(toDateOnly(local));
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    if (closed || hour >= WORK_END) {
      local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, WORK_START));
      continue;
    }
    if (hour < WORK_START) {
      local = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), WORK_START));
      continue;
    }
    const endOfDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), WORK_END);
    const step = Math.min(remaining, endOfDay - local.getTime());
    local = new Date(local.getTime() + step);
    remaining -= step;
  }
  return new Date(local.getTime() - OFFSET);
}
