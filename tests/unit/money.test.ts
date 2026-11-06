import { describe, expect, it } from "vitest";
import {
  add,
  formatMoney,
  formatPercent,
  marginRatio,
  money,
  prorate,
  round2,
  sumRounded,
  toApi,
  vatOf,
} from "@/lib/money";

describe("money()", () => {
  it("treats null/undefined/empty as zero", () => {
    expect(money(null).toString()).toBe("0");
    expect(money(undefined).toString()).toBe("0");
    expect(money("").toString()).toBe("0");
  });
  it("accepts Prisma.Decimal-like objects via toString()", () => {
    expect(money({ toString: () => "12.345" }).toString()).toBe("12.345");
  });
  it("rejects non-finite values", () => {
    expect(() => money("abc")).toThrow();
    expect(() => money(Infinity)).toThrow(RangeError);
  });
});

describe("round2 — half-up to 2dp", () => {
  it.each([
    ["1.005", "1.01"], // classic float trap: 1.005 in binary rounds down
    ["1.004", "1.00"],
    ["2.675", "2.68"],
    ["-1.005", "-1.01"],
    ["0.125", "0.13"],
    ["1000000.555", "1000000.56"],
  ])("%s → %s", (input, out) => {
    expect(round2(input).toFixed(2)).toBe(out);
  });
});

describe("add / sumRounded", () => {
  it("has no float drift (0.1 + 0.2)", () => {
    expect(add("0.1", "0.2").toString()).toBe("0.3");
  });
  it("sums rounded lines (invoice-total rule)", () => {
    // Raw sum 3.015 would round to 3.02, but lines round first: 1.01 + 1.01 + 1.01 = 3.03
    expect(sumRounded(["1.005", "1.005", "1.005"]).toFixed(2)).toBe("3.03");
  });
});

describe("prorate", () => {
  it("returns the full amount for a full month without rounding noise", () => {
    expect(prorate("10000", 30, 30).toString()).toBe("10000");
  });
  it("prorates partial months by calendar days", () => {
    // 15 of 30 days of SAR 9,000
    expect(round2(prorate("9000", 15, 30)).toFixed(2)).toBe("4500.00");
    // 10 of 31 days of SAR 10,000 = 3225.806… → 3225.81
    expect(round2(prorate("10000", 10, 31)).toFixed(2)).toBe("3225.81");
    // February leap year: 14 of 29 days of SAR 7,250 = 3500.00
    expect(round2(prorate("7250", 14, 29)).toFixed(2)).toBe("3500.00");
  });
  it("returns zero for zero active days", () => {
    expect(prorate("10000", 0, 30).isZero()).toBe(true);
  });
  it("guards invalid day counts", () => {
    expect(() => prorate("100", 31, 30)).toThrow(RangeError);
    expect(() => prorate("100", -1, 30)).toThrow(RangeError);
    expect(() => prorate("100", 1, 0)).toThrow(RangeError);
    expect(() => prorate("100", 1.5, 30)).toThrow(RangeError);
  });
});

describe("vatOf", () => {
  it("computes 15% VAT on the rounded subtotal", () => {
    expect(vatOf("100000", "0.15").toFixed(2)).toBe("15000.00");
    // subtotal 333.335 → 333.34 → VAT 50.001 → 50.00
    expect(vatOf("333.335", "0.15").toFixed(2)).toBe("50.00");
    // 1234.57 × 0.15 = 185.1855 → 185.19
    expect(vatOf("1234.57", "0.15").toFixed(2)).toBe("185.19");
  });
  it("is zero for zero-rated", () => {
    expect(vatOf("5000", "0").toFixed(2)).toBe("0.00");
  });
});

describe("marginRatio", () => {
  it("matches the prototype example (Vivo: rev 392.5K, cost 341.6K ≈ 13.0%)", () => {
    const r = marginRatio("392500", "341600")!;
    expect(formatPercent(r)).toBe("13.0%");
  });
  it("is negative when cost exceeds revenue", () => {
    expect(marginRatio("100", "120")!.toNumber()).toBeCloseTo(-0.2, 10);
  });
  it("is null (undefined) for zero revenue instead of dividing by zero", () => {
    expect(marginRatio("0", "50")).toBeNull();
    expect(formatPercent(null)).toBe("—");
  });
});

describe("transport & display", () => {
  it("serializes to fixed 2dp strings for the API", () => {
    expect(toApi("12")).toBe("12.00");
    expect(toApi("12.345")).toBe("12.35");
  });
  it("formats SAR with grouping and accounting negatives", () => {
    expect(formatMoney("1234567.5")).toBe("SAR 1,234,567.50");
    expect(formatMoney("-250", { accounting: true })).toBe("(SAR 250.00)");
    expect(formatMoney("818400", { compact: true })).toBe("SAR 818.4K");
  });
  it("formats Arabic with Latin digits and the riyal abbreviation after the amount", () => {
    expect(formatMoney("1234567.5", { locale: "ar" })).toBe("1,234,567.50 ر.س");
    expect(formatMoney("-250", { locale: "ar", accounting: true })).toBe("(250.00 ر.س)");
  });
});
