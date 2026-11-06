import { describe, expect, it } from "vitest";
import { allocationBill, monthlyCost, type RateInput } from "@/lib/finance";
import { parseDateOnly as d } from "@/lib/dates";

const percent8: RateInput = { model: "COST_PLUS_PERCENT", feePercent: "0.08" };
const fixed = (v: { toFixed(n: number): string }) => v.toFixed(2);

describe("allocationBill", () => {
  it("bills a full month", () => {
    const b = allocationBill(d("2026-01-01"), null, [{ from: d("2026-01-01"), to: null, monthly: "10000" }], "2026-09", percent8);
    expect([b.daysActive, fixed(b.cost), fixed(b.fee), fixed(b.amount)]).toEqual([30, "10000.00", "800.00", "10800.00"]);
  });
  it("is zero outside the placement", () => {
    const b = allocationBill(d("2026-10-01"), null, [{ from: d("2026-01-01"), to: null, monthly: "10000" }], "2026-09", percent8);
    expect(b.daysActive).toBe(0);
    expect(fixed(b.amount)).toBe("0.00");
  });
  it("splits a raise by day", () => {
    const pay = [
      { from: d("2026-01-01"), to: d("2026-09-16"), monthly: "3000" },
      { from: d("2026-09-16"), to: null, monthly: "6000" },
    ];
    expect(fixed(allocationBill(d("2026-01-01"), null, pay, "2026-09", percent8).cost)).toBe("4500.00");
  });
  it("counts pay only for days on this client", () => {
    // Moved away on the 11th: 10 of 30 days of 9,000.
    const b = allocationBill(d("2026-01-01"), d("2026-09-11"), [{ from: d("2026-01-01"), to: null, monthly: "9000" }], "2026-09", percent8);
    expect([b.daysActive, fixed(b.cost)]).toEqual([10, "3000.00"]);
  });
  it("a transfer mid-month adds back up to one month's pay", () => {
    const pay = [{ from: d("2026-01-01"), to: null, monthly: "7777" }];
    const a = allocationBill(d("2026-01-01"), d("2026-09-14"), pay, "2026-09", percent8);
    const b = allocationBill(d("2026-09-14"), null, pay, "2026-09", percent8);
    expect(a.daysActive + b.daysActive).toBe(30);
    expect(Math.abs(a.cost.plus(b.cost).toNumber() - 7777)).toBeLessThanOrEqual(0.01);
  });
  it("a missing pay record shows zero cost, which the run flags", () => {
    const b = allocationBill(d("2026-01-01"), null, [], "2026-09", percent8);
    expect([b.daysActive, fixed(b.cost)]).toEqual([30, "0.00"]);
  });
  it("prorates a per-head fee with the days worked", () => {
    const b = allocationBill(d("2026-09-16"), null, [{ from: d("2026-01-01"), to: null, monthly: "6000" }], "2026-09", { model: "FIXED_PER_HEAD", feePerHead: "600" });
    expect([fixed(b.cost), fixed(b.fee), fixed(b.amount)]).toEqual(["3000.00", "300.00", "3300.00"]);
  });
  it("a fixed account fee isn't charged per employee", () => {
    const b = allocationBill(d("2026-01-01"), null, [{ from: d("2026-01-01"), to: null, monthly: "5000" }], "2026-09", { model: "COST_PLUS_FIXED", feeFixedMonthly: "9000" });
    expect(fixed(b.amount)).toBe("5000.00");
  });
});

describe("monthlyCost", () => {
  it("adds every component", () => {
    expect(fixed(monthlyCost({ basic: "5000.50", housing: "1250", transport: "300.25", other: "0", gosiEmployer: "450.10", insuranceMonthly: "200" }))).toBe("7200.85");
  });
});
