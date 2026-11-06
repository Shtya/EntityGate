import { describe, expect, it } from "vitest";
import { agingBucket, agingSummary, billHead, invoiceTotals, monthlyBill, outstanding, paymentState, profitAndLoss } from "@/lib/finance";
import { overlapDays, parseDateOnly, periodBounds } from "@/lib/dates";
import { formatPercent } from "@/lib/money";

const d = parseDateOnly;
const fixed = (v: { toFixed(n: number): string }) => v.toFixed(2);

describe("invoice totals", () => {
  it("rounds each line, sums, then applies 15% VAT", () => {
    const t = invoiceTotals(["100.005", "200.005"], "0.15");
    expect(fixed(t.subtotal)).toBe("300.02");
    expect(fixed(t.vat)).toBe("45.00");
    expect(fixed(t.total)).toBe("345.02");
  });
  it("total always equals subtotal + VAT exactly, across many fractional inputs", () => {
    for (let i = 1; i < 200; i++) {
      const t = invoiceTotals([`${i}.333`, `${i * 3}.777`, "0.005"], "0.15");
      expect(t.total.equals(t.subtotal.plus(t.vat))).toBe(true);
      expect(t.total.decimalPlaces()).toBeLessThanOrEqual(2);
    }
  });
  it("handles zero-rated and empty invoices", () => {
    expect(fixed(invoiceTotals(["500"], "0").total)).toBe("500.00");
    expect(fixed(invoiceTotals([], "0.15").total)).toBe("0.00");
  });
});

describe("billing one employee", () => {
  const head = { monthlyCost: "10000", daysActive: 30, daysInPeriod: 30 };
  it("cost plus 8%", () => {
    const b = billHead(head, { model: "COST_PLUS_PERCENT", feePercent: "0.08" });
    expect([fixed(b.cost), fixed(b.fee), fixed(b.amount)]).toEqual(["10000.00", "800.00", "10800.00"]);
  });
  it("fixed fee per head, prorated with the employee", () => {
    const b = billHead({ ...head, daysActive: 15 }, { model: "FIXED_PER_HEAD", feePerHead: "600" });
    expect([fixed(b.cost), fixed(b.fee), fixed(b.amount)]).toEqual(["5000.00", "300.00", "5300.00"]);
  });
  it("joiner on 16 Sep bills 15 of 30 days, using the real allocation-day calculation", () => {
    const daysActive = overlapDays(d("2026-09-16"), null, "2026-09");
    const b = billHead({ monthlyCost: "9000", daysActive, daysInPeriod: periodBounds("2026-09").days }, { model: "COST_PLUS_PERCENT", feePercent: "0.08" });
    expect(fixed(b.amount)).toBe("4860.00");
  });
  it("a mid-month transfer bills exactly one month across two clients, to the halala", () => {
    const period = "2026-09";
    const days = periodBounds(period).days;
    const a = overlapDays(d("2026-01-01"), d("2026-09-21"), period);
    const b = overlapDays(d("2026-09-21"), null, period);
    const rate = { model: "COST_PLUS_PERCENT" as const, feePercent: "0" };
    const first = billHead({ monthlyCost: "9000", daysActive: a, daysInPeriod: days }, rate);
    const second = billHead({ monthlyCost: "9000", daysActive: b, daysInPeriod: days }, rate);
    expect(fixed(first.cost.plus(second.cost))).toBe("9000.00");
  });
});

describe("monthly bill for a client", () => {
  const heads = [
    { monthlyCost: "10000", daysActive: 30, daysInPeriod: 30 },
    { monthlyCost: "8000", daysActive: 30, daysInPeriod: 30 },
    { monthlyCost: "6000", daysActive: 10, daysInPeriod: 30 },
  ];
  it("adds fees, recoverable expenses and VAT", () => {
    const b = monthlyBill(heads, { model: "COST_PLUS_PERCENT", feePercent: "0.08" }, ["500"], "0.15");
    // cost 20,000 + 8% fee 1,600 + recoverable 500 = 22,100; VAT 3,315
    expect(fixed(b.cost)).toBe("20500.00");
    expect(fixed(b.subtotal)).toBe("22100.00");
    expect(fixed(b.vat)).toBe("3315.00");
    expect(fixed(b.total)).toBe("25415.00");
  });
  it("charges a fixed account fee once, not per employee", () => {
    const b = monthlyBill(heads, { model: "COST_PLUS_FIXED", feeFixedMonthly: "5000" }, [], "0");
    expect(fixed(b.subtotal)).toBe("25000.00");
  });
  it("charges no account fee when nobody was allocated", () => {
    const b = monthlyBill([], { model: "COST_PLUS_FIXED", feeFixedMonthly: "5000" }, [], "0.15");
    expect(fixed(b.total)).toBe("0.00");
  });
});

describe("collections (UAT-05)", () => {
  it("outstanding = invoice amount minus applied payments", () => {
    expect(fixed(outstanding("10000", ["2500.50", "2500.25"]))).toBe("4999.25");
  });
  it("follows the invoice through its payment states", () => {
    expect(paymentState("1000", [])).toBe("ISSUED");
    expect(paymentState("1000", ["999.99"])).toBe("PARTIALLY_PAID");
    expect(paymentState("1000", ["600", "400"])).toBe("PAID");
    expect(paymentState("1000", ["1200"])).toBe("PAID");
  });
  it("shows an overpayment as a negative balance rather than hiding it", () => {
    expect(fixed(outstanding("1000", ["1200"]))).toBe("-200.00");
  });
});

describe("aging", () => {
  const today = d("2026-09-10");
  it.each([
    ["2026-09-30", "CURRENT"],
    ["2026-09-10", "CURRENT"],
    ["2026-09-09", "D1_30"],
    ["2026-08-11", "D1_30"],
    ["2026-08-10", "D31_60"],
    ["2026-07-12", "D31_60"],
    ["2026-07-11", "D60_PLUS"],
  ])("due %s falls in %s", (due, bucket) => {
    expect(agingBucket(d(due), today)).toBe(bucket);
  });
  it("buckets add back up to total receivables", () => {
    const s = agingSummary(
      [
        { dueDate: d("2026-09-30"), outstanding: "251400" },
        { dueDate: d("2026-07-31"), outstanding: "341386" },
        { dueDate: d("2026-07-31"), outstanding: "108226" },
        { dueDate: d("2026-09-07"), outstanding: "146800" },
      ],
      today,
    );
    expect(fixed(s.CURRENT)).toBe("251400.00");
    expect(fixed(s.D1_30)).toBe("146800.00");
    expect(fixed(s.D31_60)).toBe("449612.00");
    expect(fixed(s.CURRENT.plus(s.D1_30).plus(s.D31_60).plus(s.D60_PLUS))).toBe("847812.00");
  });
});

describe("profit and loss", () => {
  it("revenue − direct costs = contribution; contribution − overhead = net", () => {
    const p = profitAndLoss({ revenue: ["392500"], payroll: ["320000"], directExpenses: ["21600"], overhead: ["15000"] });
    expect(fixed(p.revenue)).toBe("392500.00");
    expect(fixed(p.directCost)).toBe("341600.00");
    expect(fixed(p.contribution)).toBe("50900.00");
    expect(formatPercent(p.contributionMargin)).toBe("13.0%");
    expect(fixed(p.netProfit)).toBe("35900.00");
    expect(formatPercent(p.netMargin)).toBe("9.1%");
  });
  it("credit notes reduce revenue", () => {
    expect(fixed(profitAndLoss({ revenue: ["1000"], creditNotes: ["100"] }).revenue)).toBe("900.00");
  });
  it("reports a loss as a negative number with a negative margin", () => {
    const p = profitAndLoss({ revenue: ["100"], payroll: ["150"] });
    expect(fixed(p.netProfit)).toBe("-50.00");
    expect(formatPercent(p.contributionMargin)).toBe("-50.0%");
  });
  it("has no margin at zero revenue instead of dividing by zero", () => {
    const p = profitAndLoss({ revenue: [], overhead: ["500"] });
    expect(p.contributionMargin).toBeNull();
    expect(fixed(p.netProfit)).toBe("-500.00");
  });
});
