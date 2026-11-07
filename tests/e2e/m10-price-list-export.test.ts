/** The price list feeds invoices, only Finance edits it, and Excel exports keep each person's scope. */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 180_000 });
const db = new PrismaClient();
const codes: string[] = [];
afterAll(async () => {
  await db.servicePrice.deleteMany({ where: { code: { in: codes } } });
  await db.$disconnect();
});

const download = (cookie: string, path: string) => fetch(`${BASE}/api/v1${path}`, { headers: { Cookie: cookie } });
async function sheet(res: Response) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.arrayBuffer()) as never);
  const ws = wb.worksheets[0];
  return ws.getSheetValues().slice(1).map((r) => (r as unknown[]).slice(1));
}

describe.skipIf(!BASE || !canManage)("price list and Excel export", () => {
  it("Finance prices a service, an invoice picks it up, others can only read", async () => {
    const finance = await session.finance();
    const code = `E2E_${uniq().toUpperCase()}`;
    codes.push(code);
    const made = await api(finance, "/price-list", "POST", { code, nameEn: "E2E iqama renewal", nameAr: "تجديد إقامة", unit: "PER_EMPLOYEE", price: "650.50" });
    expect(made.status).toBe(201);
    expect((await api(finance, "/price-list", "POST", { code, nameEn: "dup", unit: "PER_REQUEST", price: "1" })).status).toBe(409);
    expect((await api(finance, "/price-list", "POST", { code: `${code}X`, nameEn: "neg", unit: "PER_REQUEST", price: "-5" })).status).toBe(422);

    const am = await session.am1();
    expect((await api(am, "/price-list")).status).toBe(200);
    expect((await api(am, `/price-list/${made.data.id}`, "PUT", { code, nameEn: "x", unit: "PER_REQUEST", price: "1" })).status).toBe(403);

    const head = await session.head();
    const clientId = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id;
    const inv = await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", serviceId: made.data.id, quantity: 3 });
    expect(inv.status).toBe(201);
    const row = await db.invoice.findUniqueOrThrow({ where: { id: inv.data.id }, include: { lines: true } });
    expect(row.lines[0].description).toBe("E2E iqama renewal");
    expect(row.subtotal.toFixed(2)).toBe("1951.50");

    // A price change applies to new invoices, not this one.
    expect((await api(finance, `/price-list/${made.data.id}`, "PUT", { code, nameEn: "E2E iqama renewal", unit: "PER_EMPLOYEE", price: "700", active: true })).status).toBe(200);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.data.id } })).subtotal.toFixed(2)).toBe("1951.50");

    // Without a service, a description is still required.
    expect((await api(finance, "/invoices", "POST", { clientId, type: "ONE_OFF", amount: "10" })).status).toBe(422);
  });

  it("exports the filtered list as Excel, logged, within the reader's scope", async () => {
    const head = await session.head();
    const tag = `E2E Xl${uniq()}`;
    const clientId = (await api(head, "/clients", "POST", { displayName: tag, legalName: "E2E" })).data.id;
    const before = await db.exportLog.count({ where: { report: "list:clients" } });

    const res = await download(head, `/exports/clients?q=${encodeURIComponent(tag)}&status=PROSPECT`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const rows = await sheet(res);
    expect(rows.length).toBe(2); // heading + the one client
    expect(rows[1]).toContain(tag);
    expect(await db.exportLog.count({ where: { report: "list:clients" } })).toBe(before + 1);

    // Every list exports.
    for (const list of ["employees", "tasks", "cases", "invoices", "payments", "expenses", "price-list"]) {
      expect((await download(await session.finance(), `/exports/${list}`)).status, list).toBe(200);
    }

    // No export permission, or no right to that list.
    expect((await download(await session.am1(), "/exports/clients")).status).toBe(403);
    expect((await download(await session.hr(), "/exports/invoices")).status).toBe(403);
    expect((await download(head, "/exports/nope")).status).toBe(404);
    expect((await download(head, "/exports/__proto__")).status).toBe(404);
    expect(clientId).toBeTruthy();
  });
});
