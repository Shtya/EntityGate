/**
 * Client feedback, 18 Nov: per client, each service can be off, go on the payroll invoice or a
 * separate expenses invoice, and carry its own fee (a percentage or a fixed amount).
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 240_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());

const year = 2100 + Math.floor(Math.random() * 7000);
const period = (m: number) => `${year}-${String(m).padStart(2, "0")}`;

describe.skipIf(!BASE || !canManage)("each client's services", () => {
  it("routes, hides and prices services per client, across two invoices", async () => {
    const head = await session.head();
    const hr = await session.hr();
    const finance = await session.finance();
    const owner = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const clientId = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id as string;
    await api(head, `/clients/${clientId}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
    await api(head, `/clients/${clientId}/status`, "POST", { status: "ONBOARDING" });
    await api(finance, `/clients/${clientId}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "0", feePercent: "10" });
    expect((await api(head, `/clients/${clientId}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);
    const emp = (await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" })).data.id;
    await api(hr, `/employees/${emp}/compensation`, "POST", { effectiveFrom: "2026-01-01", basic: "10000", gosiEmployer: "200", iqamaRenewal: "865", adminFee: "300", dependantsFees: "400", iqamaTransfer: "166.6667" });

    const rules = [
      { service: "iqamaRenewal", enabled: false, part: "PAYROLL", feeType: "CONTRACT", feeValue: null },
      { service: "adminFee", enabled: true, part: "EXPENSES", feeType: "FIXED", feeValue: "50" },
      { service: "dependantsFees", enabled: true, part: "EXPENSES", feeType: "CONTRACT", feeValue: null },
      { service: "salary", enabled: true, part: "PAYROLL", feeType: "PERCENT", feeValue: "5" },
      { service: "iqamaTransfer", enabled: true, part: "PAYROLL", feeType: "FIXED", feeValue: "100" },
    ];
    // Read-only and account roles can't change a client's pricing.
    expect((await api(await session.exec(), `/clients/${clientId}/services`, "PUT", { rules })).status).toBe(403);
    // A percentage or fixed fee needs its value.
    expect((await api(finance, `/clients/${clientId}/services`, "PUT", { rules: [{ service: "kpi", enabled: true, part: "PAYROLL", feeType: "PERCENT", feeValue: null }] })).status).toBe(422);
    expect((await api(finance, `/clients/${clientId}/services`, "PUT", { rules })).status).toBe(200);
    expect((await api(finance, `/clients/${clientId}/services`)).data.salary.fee).toEqual({ type: "PERCENT", value: "0.05" });

    const run = await api(finance, "/billing/runs", "POST", { period: period(6) });
    expect(run.status).toBe(201);
    const invoices = await db.invoice.findMany({ where: { billingRunId: run.data.id, clientId }, include: { lines: { include: { breakdown: true } } } });
    const payroll = invoices.find((i) => i.type === "MONTHLY")!;
    const expenses = invoices.find((i) => i.type === "MONTHLY_EXPENSES")!;
    // Salary 10,000 + 5%; EOS and GOSI + 10%; iqama transfer + 100 fixed. Iqama renewal is off.
    expect(payroll.total.toFixed(2)).toBe("11445.00");
    // Admin 300 + 50 fixed; dependants 400 + 10%.
    expect(expenses.total.toFixed(2)).toBe("790.00");
    expect(Number(payroll.lines[0].breakdown!.iqamaRenewal)).toBe(865); // kept, just not billed

    // Each workbook shows only its own services.
    const headings = async (id: string) => {
      const file = await fetch(`${BASE}/api/v1/invoices/${id}/breakdown`, { headers: { Cookie: finance } });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await file.arrayBuffer()) as never);
      return (wb.worksheets[0].getRow(2).values as unknown[]).slice(1);
    };
    const p = await headings(payroll.id);
    expect(p).toContain("Take Home Salary");
    expect(p).not.toContain("Iqama Renewal");
    expect(p).not.toContain("Administration Fee");
    const e = await headings(expenses.id);
    expect(e).toEqual(expect.arrayContaining(["Administration Fee", "Dependants Fees"]));
    expect(e).not.toContain("Take Home Salary");
    expect(e).not.toContain("GOSI");

    // Editing a draft can't bring back a service the client doesn't take.
    const line = payroll.lines[0];
    expect((await api(finance, `/invoices/${payroll.id}/breakdown/${line.id}`, "PUT", { workdays: 30, gosi: "200", iqamaTransfer: "166.6667", iqamaRenewal: "9999" })).status).toBe(200);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: payroll.id } })).total.toFixed(2)).toBe("11445.00");
    await api(finance, `/billing/runs/${run.data.id}/cancel`, "POST", {});
  });
});
