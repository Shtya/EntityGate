/**
 * M6 acceptance: a test month's P&L matches a hand calculation to the halala, and a closed month
 * stays closed. Uses a far-future year so nothing else lands in these months.
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 240_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());

const year = 2100 + Math.floor(Math.random() * 7000);
const period = (month: number) => `${year}-${String(month).padStart(2, "0")}`;
const date = (month: number, day: number) => `${period(month)}-${String(day).padStart(2, "0")}`;

async function makeClient(ownerEmail = "am1@entitygate.test") {
  const head = await session.head();
  const finance = await session.finance();
  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const clientId = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id as string;
  await api(head, `/clients/${clientId}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
  await api(head, `/clients/${clientId}/status`, "POST", { status: "ONBOARDING" });
  await api(finance, `/clients/${clientId}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15", feePercent: "8" });
  expect((await api(head, `/clients/${clientId}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);
  return clientId;
}

const category = (code: string) => db.expenseCategory.findUniqueOrThrow({ where: { code } }).then((c) => c.id);
const employeeOf = async (hr: string, clientId: string, from: string, basic: string) => {
  const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: from });
  await api(hr, `/employees/${data.id}/compensation`, "POST", { effectiveFrom: from, basic, housing: "0" });
  return data.id as string;
};

describe.skipIf(!BASE || !canManage)("M6: finance", () => {
  it("a month's P&L equals the hand calculation, then closes for good", async () => {
    const hr = await session.hr();
    const finance = await session.finance();
    const am = await session.am1();
    const c1 = await makeClient();
    const c2 = await makeClient("am2@entitygate.test");

    // March has 31 days. A: 10,000 all month on c1.
    await employeeOf(hr, c1, date(3, 1), "10000");
    // T: 6,200 a month, on c1 for 16 days (3,200), then c2 for 15 days (3,000).
    const moved = await employeeOf(hr, c1, date(3, 1), "6200");
    expect((await api(hr, `/employees/${moved}/allocations`, "POST", { clientId: c2, effectiveFrom: date(3, 17) })).status).toBe(201);

    const direct = await category("DIRECT_OTHER");
    const visa = await category("VISA_FEES");
    const rent = await category("OFFICE_RENT");
    const addExpense = (cookie: string, json: object) => api(cookie, "/expenses", "POST", { incurredAt: date(3, 10), ...json });
    // Approved: 300 unbillable on c1, 200 billed to c1, 100 overhead. Pending: 50, which must not count.
    const e1 = await addExpense(finance, { categoryId: direct, clientId: c1, description: "Courier", amount: "300", recoverable: false });
    expect(e1.status).toBe(201);
    const e2 = await addExpense(finance, { categoryId: visa, clientId: c1, description: "Visa", amount: "200", recoverable: true });
    const e3 = await addExpense(finance, { categoryId: rent, clientId: c1, description: "Rent", amount: "100" });
    const e4 = await addExpense(finance, { categoryId: direct, clientId: c1, description: "Waiting", amount: "50", recoverable: false });
    for (const e of [e1, e2, e3]) expect((await api(finance, `/expenses/${e.data.id}/decision`, "POST", { approved: true })).status).toBe(200);
    // Overhead stays with the company even though a client was sent.
    expect((await db.expense.findUniqueOrThrow({ where: { id: e3.data.id } })).clientId).toBeNull();

    // Billing a recoverable needs a client, and only approvers approve.
    expect((await addExpense(finance, { categoryId: visa, description: "No client", amount: "1", recoverable: true })).status).toBe(422);
    expect((await api(am, `/expenses/${e4.data.id}/decision`, "POST", { approved: true })).status).toBe(403);

    // Payroll splits the moved employee across both clients.
    const payroll = await api(finance, "/payroll/generate", "POST", { period: period(3) });
    expect(payroll.status).toBe(201);
    const movedLines = await db.payrollItem.findMany({ where: { payrollRunId: payroll.data.id, employeeId: moved } });
    expect(Object.fromEntries(movedLines.map((l) => [l.clientId, l.totalCost.toFixed(2)]))).toEqual({ [c1]: "3200.00", [c2]: "3000.00" });

    // Revenue: c1 (10,000 + 3,200) × 1.08 + 200 = 14,456. c2: 3,000 × 1.08 = 3,240.
    const run = await api(finance, "/billing/runs", "POST", { period: period(3) });
    expect(run.status).toBe(201);
    const inv1 = await db.invoice.findFirstOrThrow({ where: { billingRunId: run.data.id, clientId: c1 } });
    expect(inv1.subtotal.toFixed(2)).toBe("14456.00");
    expect((await db.expense.findUniqueOrThrow({ where: { id: e2.data.id } })).billedLineId).not.toBeNull();

    // Drafts don't count as revenue.
    const before = (await api(finance, `/finance/pnl?from=${period(3)}&to=${period(3)}`)).data;
    expect(Number(before.company.revenue)).toBe(0);

    // Not ready: pending expense, unissued invoices, unconfirmed payroll.
    expect((await api(finance, "/periods/close", "POST", { period: period(3) })).status).toBe(409);

    await api(finance, `/billing/runs/${run.data.id}/approve`, "POST", {});
    await api(finance, `/billing/runs/${run.data.id}/issue`, "POST", {});

    const after = (await api(finance, `/finance/pnl?from=${period(3)}&to=${period(3)}`)).data;
    const row1 = after.clients.find((r: { id: string }) => r.id === c1).pnl;
    // Direct cost c1 = 13,200 pay + 300 + 200 = 13,700. Contribution 14,456 − 13,700 = 756.
    expect(Number(row1.revenue)).toBe(14456);
    expect(Number(row1.directCost)).toBe(13700);
    expect(Number(row1.contribution)).toBe(756);
    const row2 = after.clients.find((r: { id: string }) => r.id === c2).pnl;
    expect(Number(row2.contribution)).toBe(240);
    expect(Number(after.company.overhead)).toBe(100);
    // Company net = every contribution, less unallocated pay and overhead.
    const sum = after.clients.reduce((a: number, r: { pnl: { contribution: string } }) => a + Number(r.pnl.contribution), 0);
    expect(Number(after.company.netProfit)).toBeCloseTo(sum - Number(after.unallocated) - 100, 2);
    expect(after.managers.length).toBeGreaterThanOrEqual(2);

    // An account manager sees only their clients, and no company overhead.
    const mine = (await api(am, `/finance/pnl?from=${period(3)}&to=${period(3)}`)).data;
    expect(mine.companyView).toBe(false);
    expect(mine.clients.some((r: { id: string }) => r.id === c2)).toBe(false);
    expect(Number(mine.company.overhead)).toBe(0);

    // Finish the checklist, then close.
    await api(finance, `/expenses/${e4.data.id}/decision`, "POST", { approved: false });
    expect((await api(finance, `/payroll/${payroll.data.id}/confirm`, "POST", { approved: true })).status).toBe(200);
    expect((await api(finance, "/payroll/generate", "POST", { period: period(3) })).status).toBe(409);
    expect((await api(am, "/periods/close", "POST", { period: period(3) })).status).toBe(403);
    expect((await api(finance, "/periods/close", "POST", { period: period(3) })).status).toBe(200);

    // Closed means closed.
    expect((await addExpense(finance, { categoryId: direct, clientId: c1, description: "Late", amount: "1", recoverable: false })).status).toBe(409);
    expect((await api(finance, "/billing/runs", "POST", { period: period(3) })).status).toBe(409);
    expect((await api(finance, `/payroll/${payroll.data.id}/confirm`, "POST", { approved: false })).status).toBe(409);
    expect((await api(finance, `/invoices/${inv1.id}/void`, "POST", {})).status).toBe(409);

    // Reopening is allowed, and audited.
    expect((await api(finance, "/periods/reopen", "POST", { period: period(3) })).status).toBe(200);
    expect(await db.auditEvent.count({ where: { entityType: "accounting_period", entityId: period(3), action: "reopen" } })).toBe(1);
    expect((await addExpense(finance, { categoryId: direct, clientId: c1, description: "After", amount: "1", recoverable: false })).status).toBe(201);
  });

  it("imports payroll all or nothing", async () => {
    const hr = await session.hr();
    const finance = await session.finance();
    const clientId = await makeClient();
    const employee = await db.employee.findUniqueOrThrow({ where: { id: await employeeOf(hr, clientId, date(5, 1), "5000") } });
    const upload = async (rows: (string | number)[][]) => {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet("Payroll");
      sheet.addRow(["employee_no", "gross", "gosi", "other_costs"]);
      rows.forEach((r) => sheet.addRow(r));
      const form = new FormData();
      form.set("period", period(5));
      form.set("file", new File([new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)], "p.xlsx"));
      return fetch(`${BASE}/api/v1/payroll/import`, { method: "POST", headers: { Cookie: finance, Origin: BASE! }, body: form });
    };
    expect((await upload([[employee.employeeNo, 1000, 0, 0], ["NOPE-1", 1, 0, 0]])).status).toBe(422);
    expect(await db.payrollRun.findUnique({ where: { period: period(5) } })).toBeNull();

    const ok = await upload([[employee.employeeNo, "5000.50", 450, 100]]);
    expect(ok.status).toBe(201);
    const item = await db.payrollItem.findFirstOrThrow({ where: { payrollRun: { period: period(5) } } });
    expect([item.totalCost.toFixed(2), item.clientId]).toEqual(["5550.50", clientId]);
  });

  it("payables are for Finance, and settling one clears it", async () => {
    const finance = await session.finance();
    const made = await api(finance, "/payables", "POST", { type: "GOSI", description: "E2E GOSI", dueDate: date(1, 15), amount: "1200" });
    expect(made.status).toBe(201);
    for (const cookie of [await session.am1(), await session.hr()]) {
      expect((await api(cookie, "/payables")).status).toBe(403);
      expect((await api(cookie, `/payables/${made.data.id}/status`, "POST", { status: "PAID" })).status).toBe(403);
    }
    expect((await api(finance, `/payables/${made.data.id}/status`, "POST", { status: "PAID", reference: "TX1" })).status).toBe(200);
    const row = await db.payable.findUniqueOrThrow({ where: { id: made.data.id } });
    expect([row.status, row.reference, row.paidAt !== null]).toEqual(["PAID", "TX1", true]);
  });
});
