/**
 * The money flow end to end, with hand-checked figures. Finance needs 2FA in production, so
 * these run against local development only (AUTH_MFA_ENFORCED=false). Uses far-future months
 * so they never collide with real billing runs.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

// A run bills every active client in the database, including those left by earlier test runs.
vi.setConfig({ testTimeout: 240_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());

const year = 2100 + Math.floor(Math.random() * 7000);
const period = (month: number) => `${year}-${String(month).padStart(2, "0")}`;
const date = (month: number, day: number) => `${period(month)}-${String(day).padStart(2, "0")}`;

/** A live client with a cost+8% contract, 15% VAT and two employees. */
async function setup() {
  const head = await session.head();
  const hr = await session.hr();
  const finance = await session.finance();
  const owner = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
  const clientId = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id as string;
  await api(head, `/clients/${clientId}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
  await api(head, `/clients/${clientId}/status`, "POST", { status: "ONBOARDING" });
  const contract = await api(finance, `/clients/${clientId}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15", feePercent: "8", sponsorshipRenewalFee: "1000" });
  expect(contract.status).toBe(201);
  expect((await api(head, `/clients/${clientId}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);
  return { head, hr, finance, clientId };
}

async function addEmployee(hr: string, clientId: string, from: string, basic: string, payFrom = from) {
  const { data } = await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: from });
  await api(hr, `/employees/${data.id}/compensation`, "POST", { effectiveFrom: payFrom, basic, housing: "0" });
  return data.id as string;
}

/** Isolates a test's client: other clients' invoices in the same run don't matter. */
async function draftFor(runId: string, clientId: string) {
  return db.invoice.findFirstOrThrow({ where: { billingRunId: runId, clientId }, include: { lines: { orderBy: { position: "asc" } } } });
}

describe.skipIf(!BASE || !canManage)("M5: billing", () => {
  it("bills a month to the halala, with proration", async () => {
    const { hr, finance, clientId } = await setup();
    // Full month in January (31 days): 10,000 cost + 8% = 10,800
    await addEmployee(hr, clientId, date(1, 1), "10000");
    // Joined on the 17th, 15 of 31 days of 6,200: cost 3,000 + 8% = 3,240
    await addEmployee(hr, clientId, date(1, 17), "6200");
    // Not started yet: not billed
    await addEmployee(hr, clientId, date(2, 1), "9999");

    const run = await api(finance, "/billing/runs", "POST", { period: period(1) });
    expect(run.status).toBe(201);
    expect((await api(finance, "/billing/runs", "POST", { period: period(1) })).status).toBe(409); // never twice

    const inv = await draftFor(run.data.id, clientId);
    expect(inv.status).toBe("DRAFT");
    expect(inv.lines.map((l) => l.amount.toFixed(2)).sort()).toEqual(["10800.00", "3240.00"]);
    expect(inv.lines.map((l) => l.costAmount.toFixed(2)).sort()).toEqual(["10000.00", "3000.00"]);
    expect(inv.subtotal.toFixed(2)).toBe("14040.00");
    expect(inv.vatAmount.toFixed(2)).toBe("2106.00");
    expect(inv.total.toFixed(2)).toBe("16146.00");
    expect(inv.number).toBeNull();

    // Must be approved before issuing, and only Finance can (BR-03).
    expect((await api(finance, `/billing/runs/${run.data.id}/issue`, "POST", {})).status).toBe(422);
    const am = await session.am1();
    expect((await api(am, `/billing/runs/${run.data.id}/approve`, "POST", {})).status).toBe(403);
    expect((await api(finance, `/billing/runs/${run.data.id}/approve`, "POST", {})).status).toBe(200);
    expect((await api(finance, `/billing/runs/${run.data.id}/issue`, "POST", {})).status).toBe(200);

    const issued = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(issued.status).toBe("ISSUED");
    expect(issued.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(issued.dueDate!.getTime() - issued.issueDate!.getTime()).toBe(30 * 86_400_000);

    // Locked once issued.
    expect((await api(finance, `/invoices/${inv.id}/lines`, "POST", { description: "x", amount: "1" })).status).toBe(422);
  });

  it("splits pay by day when it changes mid-month, across a client transfer", async () => {
    const { hr, finance, clientId } = await setup();
    const employee = await addEmployee(hr, clientId, date(4, 1), "3000");
    // April has 30 days: 3,000 for 15 days, then a raise to 6,000 for 15 days. Cost 1,500 + 3,000 = 4,500.
    await api(hr, `/employees/${employee}/compensation`, "POST", { effectiveFrom: date(4, 16), basic: "6000" });
    const run = await api(finance, "/billing/runs", "POST", { period: period(4) });
    const inv = await draftFor(run.data.id, clientId);
    const line = inv.lines.find((l) => l.employeeId === employee)!;
    expect(line.costAmount.toFixed(2)).toBe("4500.00");
    expect(line.amount.toFixed(2)).toBe("4860.00");
    await api(finance, `/billing/runs/${run.data.id}/cancel`, "POST", {});
  });

  it("two payments: outstanding = amount minus applied payments (UAT-05)", async () => {
    const { finance, clientId } = await setup();
    const made = await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "Setup", amount: "1000" });
    expect(made.status).toBe(201);
    const id = made.data.id;
    expect((await api(finance, `/invoices/${id}/issue`, "POST", {})).status).toBe(200);
    expect((await api(finance, `/invoices/${id}`)).data.total).toBe("1150");

    const first = await api(finance, "/payments", "POST", { clientId, invoiceId: id, amount: "500.25", receivedAt: date(5, 1), method: "bank_transfer", reference: "A" });
    expect(first.data.applied).toBe("500.25");
    let inv = (await api(finance, `/invoices/${id}`)).data;
    expect(inv.outstanding).toBe("649.75");
    expect(inv.status).toBe("PARTIALLY_PAID");

    await api(finance, "/payments", "POST", { clientId, invoiceId: id, amount: "649.75", receivedAt: date(5, 2), method: "cheque" });
    inv = (await api(finance, `/invoices/${id}`)).data;
    expect(inv.outstanding).toBe("0.00");
    expect(inv.status).toBe("PAID");

    // An overpayment stays on account instead of over-collecting the invoice.
    const made2 = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "100" })).data.id;
    await api(finance, `/invoices/${made2}/issue`, "POST", {});
    const over = await api(finance, "/payments", "POST", { clientId, amount: "200", receivedAt: date(5, 3), method: "other" });
    expect([over.data.applied, over.data.unapplied]).toEqual(["115.00", "85.00"]);
  });

  it("credit notes reduce what's owed, can't exceed it, and keep numbering separate", async () => {
    const { finance, clientId } = await setup();
    const id = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "1000" })).data.id;
    await api(finance, `/invoices/${id}/issue`, "POST", {});
    expect((await api(finance, `/invoices/${id}/credit`, "POST", { amount: "5000", reason: "too much" })).status).toBe(422);
    const credit = await api(finance, `/invoices/${id}/credit`, "POST", { amount: "200", reason: "Goodwill" });
    expect(credit.status).toBe(201);
    const note = await db.invoice.findUniqueOrThrow({ where: { id: credit.data.id } });
    expect(note.number).toMatch(/^CN-/);
    expect(note.total.toFixed(2)).toBe("-230.00");
    expect((await api(finance, `/invoices/${id}`)).data.outstanding).toBe("920.00");
  });

  it("a renewal invoice uses the contract's fee × quantity", async () => {
    const { finance, clientId } = await setup();
    const res = await api(finance, "/invoices", "POST", { clientId, type: "SPONSORSHIP_RENEWAL", description: "Renewals", quantity: 3 });
    expect(res.status).toBe(201);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(inv.subtotal.toFixed(2)).toBe("3000.00");
    expect(inv.total.toFixed(2)).toBe("3450.00");
  });

  it("issued numbers are gapless, and voiding keeps the record", async () => {
    const { finance, clientId } = await setup();
    const issue = async () => {
      const id = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "10" })).data.id;
      await api(finance, `/invoices/${id}/issue`, "POST", {});
      return db.invoice.findUniqueOrThrow({ where: { id } });
    };
    const a = await issue();
    const b = await issue();
    expect(Number(b.number!.slice(-5))).toBe(Number(a.number!.slice(-5)) + 1);
    expect((await api(finance, `/invoices/${a.id}/void`, "POST", {})).status).toBe(200);
    const voided = await db.invoice.findUniqueOrThrow({ where: { id: a.id } });
    expect(voided.status).toBe("VOID");
    expect(voided.number).toBe(a.number);
  });

  it("restricts money actions to Finance, even by direct API call (UAT-07, BR-03)", async () => {
    const { finance, clientId } = await setup();
    const id = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "10" })).data.id;
    for (const cookie of [await session.head(), await session.am1(), await session.exec()]) {
      expect((await api(cookie, `/invoices/${id}/issue`, "POST", {})).status).toBe(403);
      expect((await api(cookie, "/payments", "POST", { clientId, amount: "1", receivedAt: date(1, 1), method: "other" })).status).toBe(403);
      expect((await api(cookie, "/billing/runs", "POST", { period: period(12) })).status).toBe(403);
    }
  });

  it("an account manager sees only their clients' invoices", async () => {
    const { finance, clientId } = await setup();
    const id = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "10" })).data.id;
    expect((await api(await session.am1(), `/invoices/${id}`)).status).toBe(200); // owner
    expect((await api(await session.am2(), `/invoices/${id}`)).status).toBe(403);
  });
});
