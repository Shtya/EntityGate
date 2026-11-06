import { describe, expect, it } from "vitest";
import { addWorkingHours, formatDate, formatDateTime, greetingKey, isPeriod, overlapDays, parseDateOnly, periodBounds, periodOf, toDateOnly, todayDate } from "@/lib/dates";

const d = (s: string) => parseDateOnly(s);

describe("periods", () => {
  it("validates YYYY-MM", () => {
    expect(isPeriod("2026-09")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-9")).toBe(false);
  });
  it("computes half-open bounds and day counts", () => {
    expect(periodBounds("2026-09").days).toBe(30);
    expect(periodBounds("2026-12").days).toBe(31);
    expect(periodBounds("2028-02").days).toBe(29); // leap year
    expect(periodBounds("2026-02").days).toBe(28);
    const { start, end } = periodBounds("2026-12");
    expect(toDateOnly(start)).toBe("2026-12-01");
    expect(toDateOnly(end)).toBe("2027-01-01");
  });
  it("derives the period of a date", () => {
    expect(periodOf(d("2026-09-30"))).toBe("2026-09");
  });
});

describe("overlapDays (allocation proration)", () => {
  it("full month for an allocation spanning the period", () => {
    expect(overlapDays(d("2026-01-01"), null, "2026-09")).toBe(30);
  });
  it("joiner mid-month counts from the start date inclusive", () => {
    expect(overlapDays(d("2026-09-16"), null, "2026-09")).toBe(15);
  });
  it("leaver: effective_to is exclusive", () => {
    // last working day 10 Sep → effective_to 11 Sep → 10 days
    expect(overlapDays(d("2026-01-01"), d("2026-09-11"), "2026-09")).toBe(10);
  });
  it("transfer within the month splits days without double counting", () => {
    const a = overlapDays(d("2026-01-01"), d("2026-09-21"), "2026-09");
    const b = overlapDays(d("2026-09-21"), null, "2026-09");
    expect(a + b).toBe(30);
  });
  it("zero for ranges outside the period", () => {
    expect(overlapDays(d("2026-10-01"), null, "2026-09")).toBe(0);
    expect(overlapDays(d("2026-01-01"), d("2026-09-01"), "2026-09")).toBe(0);
  });
});

describe("company timezone (Asia/Riyadh, UTC+3)", () => {
  it("rolls to the next day at 21:00 UTC", () => {
    expect(toDateOnly(todayDate(new Date("2026-09-10T20:59:00Z")))).toBe("2026-09-10");
    expect(toDateOnly(todayDate(new Date("2026-09-10T21:00:00Z")))).toBe("2026-09-11");
  });
});

describe("parseDateOnly", () => {
  it("rejects impossible dates", () => {
    expect(() => parseDateOnly("2026-02-30")).toThrow();
    expect(() => parseDateOnly("10/09/2026")).toThrow();
  });
});

describe("locale-aware formatting", () => {
  const when = new Date("2026-11-06T13:30:00Z"); // 16:30 in Riyadh
  it("uses Riyadh time and day-month-year in English", () => {
    expect(formatDate(when, "en")).toBe("6 Nov 2026");
    expect(formatDateTime(when, "en")).toContain("16:30");
  });
  it("uses the Gregorian calendar and Latin digits in Arabic, never Hijri", () => {
    const text = formatDate(when, "ar");
    expect(text).toContain("2026");
    expect(text).toContain("نوفمبر");
    expect(text).not.toMatch(/[\u0660-\u0669]/); // no Arabic-Indic digits
    expect(text).not.toContain("1448"); // the Hijri year for this date
  });
  it("picks the greeting from the Riyadh hour", () => {
    expect(greetingKey(new Date("2026-11-06T05:00:00Z"))).toBe("morning");
    expect(greetingKey(new Date("2026-11-06T11:00:00Z"))).toBe("afternoon");
    expect(greetingKey(new Date("2026-11-06T15:00:00Z"))).toBe("evening");
  });
});

describe("working hours (Sun-Thu 08:00-17:00 Riyadh)", () => {
  // 2026-09-10 is a Thursday. 08:00 Riyadh is 05:00 UTC.
  const at = (s: string) => new Date(s);
  it("adds within the same day", () => {
    expect(addWorkingHours(at("2026-09-09T06:00:00Z"), 4).toISOString()).toBe("2026-09-09T10:00:00.000Z");
  });
  it("carries over to the next working day", () => {
    expect(addWorkingHours(at("2026-09-09T12:00:00Z"), 4).toISOString()).toBe("2026-09-10T07:00:00.000Z");
  });
  it("skips the Friday-Saturday weekend", () => {
    expect(addWorkingHours(at("2026-09-10T13:00:00Z"), 2).toISOString()).toBe("2026-09-13T06:00:00.000Z");
  });
  it("starts counting at opening time when raised out of hours", () => {
    expect(addWorkingHours(at("2026-09-08T22:00:00Z"), 1).toISOString()).toBe("2026-09-09T06:00:00.000Z");
  });
  it("skips public holidays", () => {
    expect(addWorkingHours(at("2026-09-09T13:00:00Z"), 2, [parseDateOnly("2026-09-10")]).toISOString()).toBe("2026-09-13T06:00:00.000Z");
  });
});
