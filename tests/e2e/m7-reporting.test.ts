/** M7: dashboards follow scope and filters (UAT-06), search respects access, exports are logged. */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 180_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());

async function makeClient(name: string, ownerEmail: string) {
  const head = await session.head();
  const owner = await db.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const clientId = (await api(head, "/clients", "POST", { displayName: name, legalName: name })).data.id as string;
  await api(head, `/clients/${clientId}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
  await api(head, `/clients/${clientId}/status`, "POST", { status: "ONBOARDING" });
  await api(await session.finance(), `/clients/${clientId}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15", feePercent: "8" });
  expect((await api(head, `/clients/${clientId}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);
  return clientId;
}

const download = (cookie: string, path: string) => fetch(`${BASE}/api/v1${path}`, { headers: { Cookie: cookie } });

describe.skipIf(!BASE || !canManage)("M7: reporting", () => {
  it("the global filter narrows every widget, and scope can't be widened (UAT-06)", async () => {
    const hr = await session.hr();
    const finance = await session.finance();
    const a = await makeClient(`E2E ${uniq()}`, "am1@entitygate.test");
    const b = await makeClient(`E2E ${uniq()}`, "am2@entitygate.test");
    await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId: a, effectiveFrom: "2026-01-01" });
    await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "GOSI", clientId: b, effectiveFrom: "2026-01-01" });
    const inv = (await api(finance, "/invoices", "POST", { clientId: a, type: "ONE_OFF", description: "x", amount: "1000" })).data.id;
    await api(finance, `/invoices/${inv}/issue`, "POST", {});

    const narrowed = (await api(finance, `/dashboard?client=${a}`)).data;
    expect(narrowed.headcount.total).toBe(1);
    expect(narrowed.headcount.SPONSORED).toBe(1);
    expect(narrowed.money.total).toBe("1150.00");
    expect(Number(narrowed.current.revenue)).toBe(1000);
    expect(narrowed.companyView).toBe(false);

    const whole = (await api(finance, "/dashboard")).data;
    expect(whole.companyView).toBe(true);
    expect(whole.headcount.total).toBeGreaterThan(narrowed.headcount.total);
    expect(whole.trend).toHaveLength(12);

    // Someone else's client gives an AM nothing, even when asked for by id.
    const am = await session.am2();
    const blocked = (await api(am, `/dashboard?client=${a}`)).data;
    expect(blocked.headcount.total).toBe(0);
    expect(blocked.money.total).toBe("0.00");
    expect(Number(blocked.current.revenue)).toBe(0);

    // A narrow permission set gets only its own widgets.
    const hrView = (await api(hr, "/dashboard")).data;
    expect(hrView.current).toBeNull();
    expect(hrView.money).toBeNull();
    expect(hrView.headcount).not.toBeNull();
  });

  it("search finds what you may open, and nothing else (GEN-01)", async () => {
    const tag = `Zq${uniq()}`;
    const clientId = await makeClient(`E2E ${tag}`, "am1@entitygate.test");
    expect((await fetch(`${BASE}/api/v1/search?q=${tag}`)).status).toBe(401);
    const mine = (await api(await session.am1(), `/search?q=${tag}`)).data;
    expect(mine.map((h: { id: string }) => h.id)).toContain(clientId);
    expect(mine[0].href).toBe(`/clients/${clientId}`);
    expect((await api(await session.am2(), `/search?q=${tag}`)).data).toEqual([]);
    expect((await api(await session.am1(), "/search?q=a")).data).toEqual([]);
  });

  it("exports are permission-checked, logged and safe to open", async () => {
    const finance = await session.finance();
    const tag = `=SUM(${uniq()})`;
    const clientId = await makeClient(tag, "am1@entitygate.test");
    const inv = (await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", description: "x", amount: "100" })).data.id;
    await api(finance, `/invoices/${inv}/issue`, "POST", {});

    const before = await db.exportLog.count({ where: { report: "aging" } });
    const csv = await download(finance, `/reports/aging/export?format=csv&client=${clientId}`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await csv.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // lets Excel read Arabic
    const body = await csv.text();
    expect(body).toContain(`'${tag}`); // a client name can't run as a formula
    expect(body).toContain("115.00");
    expect(await db.exportLog.count({ where: { report: "aging" } })).toBe(before + 1);

    const xlsx = await download(finance, `/reports/invoices/export?format=xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");

    // No report:export.
    expect((await download(await session.am1(), "/reports/aging/export")).status).toBe(403);
    // Has report:export, not the report's own permission.
    const hr = await session.hr();
    expect((await download(hr, "/reports/aging/export")).status).toBe(403);
    expect((await download(finance, "/reports/nope/export")).status).toBe(404);
  });
});
