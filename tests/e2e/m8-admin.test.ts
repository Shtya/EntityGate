/** M8: reference data stays with admins and takes effect, and files follow the record they belong to. */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 120_000 });
const db = new PrismaClient();
const made: { sponsor?: string; category?: string; holiday?: string } = {};
afterAll(async () => {
  if (made.holiday) await db.holiday.deleteMany({ where: { id: made.holiday } });
  await db.$disconnect();
});

const PDF = new File([Buffer.from("%PDF-1.4 test")], "x.pdf", { type: "application/pdf" });
async function upload(cookie: string) {
  const form = new FormData();
  form.set("file", PDF);
  const res = await fetch(`${BASE}/api/v1/attachments`, { method: "POST", headers: { Cookie: cookie, Origin: BASE! }, body: form });
  expect(res.status).toBe(201);
  return (await res.json()).data.id as string;
}
const getFile = (cookie: string, id: string) => fetch(`${BASE}/api/v1/attachments/${id}`, { headers: { Cookie: cookie } });

describe.skipIf(!BASE || !canManage)("M8: admin", () => {
  it("only administrators change reference data, and a new category works at once", async () => {
    const admin = await session.admin();
    const hr = await session.hr();
    expect((await api(hr, "/master-data/sponsors", "POST", { name: "x", type: "OWN" })).status).toBe(403);

    const sponsor = await api(admin, "/master-data/sponsors", "POST", { name: `E2E ${uniq()}`, type: "THIRD_PARTY" });
    expect(sponsor.status).toBe(201);
    expect((await api(admin, `/master-data/sponsors/${sponsor.data.id}`, "PUT", { name: `E2E ${uniq()}`, type: "OWN" })).status).toBe(200);
    expect((await db.sponsor.findUniqueOrThrow({ where: { id: sponsor.data.id } })).type).toBe("OWN");

    const code = `E2E_${uniq().toUpperCase()}`;
    expect((await api(admin, "/master-data/expense-categories", "POST", { code: "bad code!", name: "x", kind: "DIRECT" })).status).toBe(422);
    const cat = await api(admin, "/master-data/expense-categories", "POST", { code, name: "E2E cost", kind: "OVERHEAD" });
    expect(cat.status).toBe(201);
    const finance = await session.finance();
    const expense = await api(finance, "/expenses", "POST", { categoryId: cat.data.id, description: "E2E", amount: "5", incurredAt: "2199-01-01" });
    expect(expense.status).toBe(201);
    // With expenses on it, the type can't flip and quietly move them out of overhead.
    expect((await api(admin, `/master-data/expense-categories/${cat.data.id}`, "PUT", { code, name: "E2E cost", kind: "DIRECT" })).status).toBe(409);

    const holiday = await api(admin, "/master-data/holidays", "POST", { date: `2${String(Math.floor(Math.random() * 900) + 100)}-02-22`, name: "E2E holiday" });
    expect(holiday.status).toBe(201);
    made.holiday = holiday.data.id;
    expect((await api(admin, `/master-data/holidays/${holiday.data.id}`, "DELETE")).status).toBe(200);
    made.holiday = undefined;
  });

  it("a file follows its record: another account's manager can't read it", async () => {
    const head = await session.head();
    const hr = await session.hr();
    const am1 = await session.am1();
    const am2 = await session.am2();
    const owner = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const clientId = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id;
    await api(head, `/clients/${clientId}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: "2026-01-01" });
    const employee = (await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId, effectiveFrom: "2026-01-01" })).data.id;

    const file = await upload(hr);
    expect((await api(hr, "/documents", "POST", { ownerType: "EMPLOYEE", ownerId: employee, type: "IQAMA", attachmentId: file })).status).toBe(201);
    expect((await getFile(hr, file)).status).toBe(200); // uploader
    expect((await getFile(am1, file)).status).toBe(200); // their client
    expect((await getFile(am2, file)).status).toBe(403); // holds document:read, wrong client

    // Not attached to anything yet: not open to everyone with document:read.
    const loose = await upload(hr);
    expect((await getFile(am1, loose)).status).toBe(403);
    expect((await getFile(hr, loose)).status).toBe(200);
  });
});
