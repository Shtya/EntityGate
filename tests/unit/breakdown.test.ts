import { describe, expect, it } from "vitest";
import { billedWorkdays, employeeBreakdown, SAR_PER_USD } from "@/lib/breakdown";
import { money } from "@/lib/money";

const fixed = (v: { toFixed(n: number): string }) => v.toFixed(2);

describe("employeeBreakdown: the client's sheet (Oct 2026 invoice breakdown)", () => {
  // Fady's row, entered exactly as the sheet has it.
  const fady = employeeBreakdown({
    salary: "32000",
    workdays: 30,
    billEos: true,
    charges: { gosi: "640", iqamaRenewal: "865", exitReentry: money(200).dividedBy(12), flightTicket: "150", iqamaTransfer: money(2000).dividedBy(12), adminFee: "350", dependantsFees: "1200" },
    fee: { model: "COST_PLUS_PERCENT", directRate: "0.11", indirectRate: "0.11" },
  });

  it("matches every total in the sheet", () => {
    expect(fixed(fady.directTotal)).toBe("32000.00");
    expect(fixed(fady.eos)).toBe("1333.33");
    expect(fixed(fady.indirectTotal)).toBe("4721.67");
    expect(fixed(fady.cost)).toBe("36721.67");
    expect(fixed(fady.serviceFee)).toBe("4039.38");
    expect(fixed(fady.total)).toBe("40761.05");
  });
  it("converts to USD at the peg, as the sheet's last row does", () => {
    expect(fixed(fady.total.dividedBy(SAR_PER_USD))).toBe("10869.61");
  });
});

describe("employeeBreakdown: fee terms from the client's Sheet2", () => {
  // Direct 10,000; indirect 416.67 (EOS) + 200 + 300 = 916.67.
  const base = { salary: "10000", workdays: 30, billEos: true, charges: { gosi: "200", adminFee: "300" } };
  it("charges separate rates on direct and indirect costs (HMD: 12% and 6%)", () => {
    const b = employeeBreakdown({ ...base, fee: { model: "COST_PLUS_PERCENT", directRate: "0.12", indirectRate: "0.06" } });
    expect(fixed(b.serviceFee)).toBe("1255.00");
  });
  it("can charge nothing on indirect costs (Xiaomi: 5% and 0%)", () => {
    const b = employeeBreakdown({ ...base, fee: { model: "COST_PLUS_PERCENT", directRate: "0.05", indirectRate: "0" } });
    expect([fixed(b.serviceFee), fixed(b.total)]).toEqual(["500.00", "11416.67"]);
  });
  it("uses the direct rate for indirect costs when none is set, as existing contracts expect", () => {
    const b = employeeBreakdown({ ...base, fee: { model: "COST_PLUS_PERCENT", directRate: "0.10" } });
    // 12,008.33 total − 10,916.67 cost: the fee is what makes the rounded columns add up.
    expect([fixed(b.cost), fixed(b.serviceFee), fixed(b.total)]).toEqual(["10916.67", "1091.66", "12008.33"]);
  });
  it("charges per head (AAIS: 2,500) and per day worked (Black Box: 200)", () => {
    expect(fixed(employeeBreakdown({ ...base, fee: { model: "FIXED_PER_HEAD", perHead: "2500" } }).serviceFee)).toBe("2500.00");
    expect(fixed(employeeBreakdown({ ...base, workdays: 22, fee: { model: "PER_DAY", perDay: "200" } }).serviceFee)).toBe("4400.00");
  });
});

describe("employeeBreakdown: each client's service settings (feedback, 18 Nov)", () => {
  // Direct 10,000; EOS 416.67, GOSI 200, admin 300, iqama renewal 865.
  const base = { salary: "10000", workdays: 30, billEos: true, charges: { gosi: "200", adminFee: "300", iqamaRenewal: "865" }, fee: { model: "COST_PLUS_PERCENT" as const, directRate: "0.10" } };

  it("leaves a service the client doesn't take off the invoice entirely", () => {
    const b = employeeBreakdown({ ...base, rules: { iqamaRenewal: { enabled: false } } });
    expect(b.included).not.toContain("iqamaRenewal");
    expect(fixed(b.billed.iqamaRenewal)).toBe("0.00");
    expect(fixed(b.indirectTotal)).toBe("916.67");
  });
  it("splits services between the payroll invoice and a separate expenses invoice", () => {
    const rules = { iqamaRenewal: { part: "EXPENSES" as const }, adminFee: { part: "EXPENSES" as const } };
    const payroll = employeeBreakdown({ ...base, rules });
    const expenses = employeeBreakdown({ ...base, rules, part: "EXPENSES" });
    expect(expenses.included).toEqual(["iqamaRenewal", "adminFee"]);
    expect(fixed(expenses.cost)).toBe("1165.00");
    expect(fixed(payroll.cost)).toBe("10616.67");
    // Nothing is lost or counted twice.
    expect(fixed(payroll.cost.plus(expenses.cost))).toBe(fixed(employeeBreakdown(base).cost));
  });
  it("gives each service its own fee: a percentage of its amount or a fixed amount", () => {
    const b = employeeBreakdown({ ...base, rules: { salary: { fee: { type: "PERCENT", value: "0.05" } }, iqamaRenewal: { fee: { type: "FIXED", value: "150" } }, gosi: { fee: { type: "PERCENT", value: "0" } } } });
    // 5% of 10,000 = 500; iqama renewal 150 fixed; GOSI 0%; EOS and admin keep the contract's 10% = 71.67.
    expect(fixed(b.serviceFee)).toBe("721.66"); // the fee is total − cost, so the rounded columns add up
  });
  it("charges a fixed fee only when the service is provided that month", () => {
    const b = employeeBreakdown({ ...base, rules: { newVisa: { fee: { type: "FIXED", value: "300" } } } });
    expect(fixed(b.serviceFee)).toBe(fixed(employeeBreakdown(base).serviceFee));
  });
});

describe("employeeBreakdown: a part month", () => {
  it("bills salary and standing charges for the days worked, one-off charges in full", () => {
    const b = employeeBreakdown({ salary: "9000", workdays: 15, deductions: "100", gasSupport: "300", kpi: "500", billEos: true, charges: { gosi: "180", newVisa: "2000" }, fee: { model: "COST_PLUS_PERCENT", directRate: "0" } });
    expect(fixed(b.directTotal)).toBe("5200.00");
    expect(fixed(b.eos)).toBe("187.50");
    expect(fixed(b.billed.gosi)).toBe("90.00");
    expect(fixed(b.billed.newVisa)).toBe("2000.00");
  });
  it("can leave end-of-service out", () => {
    expect(fixed(employeeBreakdown({ salary: "9000", workdays: 30, billEos: false, fee: { model: "COST_PLUS_PERCENT", directRate: "0" } }).indirectTotal)).toBe("0.00");
  });
  it("counts a whole month as 30 days, whatever its length", () => {
    expect([billedWorkdays(31, 31), billedWorkdays(28, 28), billedWorkdays(15, 31), billedWorkdays(30, 31)]).toEqual([30, 30, 15, 30]);
  });
});
