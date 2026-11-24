/**
 * Client feedback, 17 Nov: a real billing run reproduces the client's own invoice breakdown sheet,
 * the breakdown can be edited on a draft, and it downloads as the client's workbook.
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
const date = (m: number, d: number) => `${period(m)}-${String(d).padStart(2, "0")}`;

async function client(fees: Record<string, unknown>) {
  const head = await session.head();
  const finance = await session.finance();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
  const id = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id as string;
  await api(head, `/clients/${id}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
  await api(head, `/clients/${id}/status`, "POST", { status: "ONBOARDING" });
  const c = await api(finance, `/clients/${id}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "0", ...fees });
  expect(c.status).toBe(201);
  expect((await api(head, `/clients/${id}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);
  return id;
}

async function employee(clientId: string, pay: Record<string, string>) {
  const hr = await session.hr();
  const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" });
  expect((await api(hr, `/employees/${data.id}/compensation`, "POST", { effectiveFrom: "2026-01-01", ...pay })).status).toBe(201);
  return data.id as string;
}

const lineFor = (runId: string, clientId: string) => db.invoiceLine.findFirstOrThrow({ where: { invoice: { billingRunId: runId, clientId }, sourceType: "ALLOCATION" }, include: { breakdown: true, invoice: true } });

describe.skipIf(!BASE || !canManage)("invoice breakdown from the client's sheet", () => {
  it("bills Fady's row to the halala: 40,761.05", async () => {
    const finance = await session.finance();
    const c = await client({ billingModel: "COST_PLUS_PERCENT", feePercent: "11", feeIndirectPercent: "11", billEndOfService: true });
    // Exactly the sheet's inputs. Yearly costs as yearly ÷ 12 to four places.
    await employee(c, { basic: "32000", gosiEmployer: "640", iqamaRenewal: "865", exitReentry: "16.6667", flightTicket: "150", iqamaTransfer: "166.6667", adminFee: "350", dependantsFees: "1200" });
    const run = await api(finance, "/billing/runs", "POST", { period: period(10) });
    expect(run.status).toBe(201);
    const line = await lineFor(run.data.id, c);
    expect(line.amount.toFixed(2)).toBe("40761.05");
    expect(line.costAmount.toFixed(2)).toBe("36721.67");
    expect(Number(line.breakdown!.workdays)).toBe(30);

    // Editing a draft recalculates the line and the invoice: 2 days off, a 500 KPI.
    const edited = await api(finance, `/invoices/${line.invoiceId}/breakdown/${line.id}`, "PUT", { workdays: 28, kpi: "500", gosi: "640", iqamaRenewal: "865", exitReentry: "16.6667", flightTicket: "150", iqamaTransfer: "166.6667", adminFee: "350", dependantsFees: "1200" });
    expect(edited.status).toBe(200);
    const after = await db.invoiceLine.findUniqueOrThrow({ where: { id: line.id }, include: { invoice: true } });
    // Direct 32,000 ÷ 30 × 28 + 500 = 30,366.67; indirect 4,721.67 × 28 ÷ 30 = 4,406.89; both + 11%.
    expect(after.amount.toFixed(2)).toBe("38598.65");
    expect(after.invoice.subtotal.toFixed(2)).toBe("38598.65");

    // The client's workbook: their headings, the employee row, then SAR and USD totals.
    const file = await fetch(`${BASE}/api/v1/invoices/${line.invoiceId}/breakdown`, { headers: { Cookie: finance } });
    expect(file.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await file.arrayBuffer()) as never);
    const ws = wb.worksheets[0];
    expect(ws.getRow(2).getCell(2).value).toBe("Employee Name");
    expect(ws.getRow(2).getCell(29).value).toBe("Service fee 11%");
    expect(ws.getRow(3).getCell(30).value).toBe(38598.65);
    expect(ws.getRow(4).getCell(1).value).toBe("Total-SAR");
    expect(ws.getRow(5).getCell(1).value).toBe("Total-USD");

    // Issued invoices can't be changed.
    await api(finance, `/billing/runs/${run.data.id}/approve`, "POST", {});
    await api(finance, `/billing/runs/${run.data.id}/issue`, "POST", {});
    expect((await api(finance, `/invoices/${line.invoiceId}/breakdown/${line.id}`, "PUT", { workdays: 30 })).status).toBe(422);
    // Only people who can see the client get the file.
    expect((await fetch(`${BASE}/api/v1/invoices/${line.invoiceId}/breakdown`, { headers: { Cookie: await session.am2() } })).status).toBe(403);
  });

  it("applies the fee terms from Sheet2: separate rates, per head, per day", async () => {
    const finance = await session.finance();
    const pay = { basic: "10000", gosiEmployer: "200", adminFee: "300" }; // indirect 416.67 + 200 + 300
    const hmd = await client({ billingModel: "COST_PLUS_PERCENT", feePercent: "12", feeIndirectPercent: "6" });
    const xiaomi = await client({ billingModel: "COST_PLUS_PERCENT", feePercent: "5", feeIndirectPercent: "0", billEndOfService: false });
    const aais = await client({ billingModel: "FIXED_PER_HEAD", feePerHead: "2500" });
    const blackBox = await client({ billingModel: "PER_DAY", feePerDay: "200" });
    expect((await api(finance, `/clients/${blackBox}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "PER_DAY", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15" })).status).toBe(422);
    for (const c of [hmd, xiaomi, aais, blackBox]) await employee(c, pay);
    const run = await api(finance, "/billing/runs", "POST", { period: period(11) });
    const amount = async (c: string) => (await lineFor(run.data.id, c)).amount.toFixed(2);
    expect(await amount(hmd)).toBe("12171.67"); // 10,916.67 + 1,200 + 55.00
    expect(await amount(xiaomi)).toBe("11000.00"); // no EOS: 10,500 + 500 on direct only
    expect(await amount(aais)).toBe("13416.67");
    expect(await amount(blackBox)).toBe("16916.67"); // 30 days × 200
    await api(finance, `/billing/runs/${run.data.id}/cancel`, "POST", {});
  });
});
