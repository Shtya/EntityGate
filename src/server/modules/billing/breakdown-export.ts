import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { decrypt, mask } from "@/server/crypto";
import { can, type Actor } from "@/server/rbac/policy";
import { SAR_PER_USD, type Breakdown, type Service } from "@/lib/breakdown";
import { toDateOnly } from "@/lib/dates";
import { money, vatOf, type Money } from "@/lib/money";
import { getInvoice } from "./service";
import { invoiceBreakdown } from "./breakdown";

/** The client's own column headings for each service. */
const SERVICE_HEADING: Record<Service, string> = {
  salary: "Take Home Salary", gasSupport: "Gas Support", kpi: "KPI/Incentives", eos: "EOS", medical: "Medical", gosi: "GOSI", iqamaRenewal: "Iqama Renewal",
  exitReentry: "Exit Re-entry", flightTicket: "Flight Ticket", iqamaTransfer: "Iqama Transfer", adminFee: "Administration Fee", dependantsFees: "Dependants Fees",
  ajeer: "Ajeer", sponsorshipTransfer: "Sponsorship transfer", newVisa: "New Visa", payout: "Payout", other: "Other",
};

type Row = Awaited<ReturnType<typeof invoiceBreakdown>>["rows"][number];
interface Column {
  heading: string;
  /** Summed in the totals rows. */
  sum: boolean;
  /** Converted to USD in the last row. */
  usd: boolean;
  value: (r: Row, extra: { vat: Money }) => string | number | null;
}

const n = (v: { toFixed(d: number): string }) => Number(v.toFixed(2));
const pct = (v: unknown) => (v === null || v === undefined ? null : `${money(String(v)).times(100).toDecimalPlaces(2).toString()}%`);

/**
 * The monthly invoice as the client's "Invoice Breakdown" workbook. It shows only the services this
 * invoice carries, so a service a client doesn't take, or takes on the other invoice, never appears.
 */
export async function breakdownWorkbook(actor: Actor, invoiceId: string) {
  const invoice = await getInvoice(invoiceId); // also checks this person may see the client
  const { rows, services } = await invoiceBreakdown(invoiceId);
  const sensitive = can(actor, "employee:read_sensitive");
  const ids = await db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId).filter((v): v is string => Boolean(v)) } }, select: { id: true, iqamaNo: true } });
  const iqama = new Map(ids.map((e) => [e.id, decrypt(e.iqamaNo)]));
  const vatRate = invoice.vatRate.toString();
  const has = (s: Service) => services.includes(s);
  const svc = (s: Service, pick: (c: Breakdown) => Money): Column => ({ heading: SERVICE_HEADING[s], sum: true, usd: true, value: (r) => n(pick(r.calc)) });

  // One fee rate for everyone shows in the heading, as in the sheet ("Service fee 11%").
  const rates = new Set(rows.map((r) => (r.stored.feeModel === "COST_PLUS_PERCENT" && Object.keys((r.stored.rules as object) ?? {}).every((k) => !((r.stored.rules as Record<string, { fee?: unknown }>)[k]?.fee)) && String(r.stored.indirectRate ?? r.stored.directRate) === String(r.stored.directRate) ? pct(r.stored.directRate) : "mixed")));
  const feeHeading = rates.size === 1 && !rates.has("mixed") && !rates.has(null) ? `Service fee ${[...rates][0]}` : "Service fee";
  const direct = has("salary") || has("gasSupport") || has("kpi");

  const columns: Column[] = [
    { heading: "#", sum: false, usd: false, value: () => null },
    { heading: "Employee Name", sum: false, usd: false, value: (r) => r.stored.employeeName },
    { heading: "Region", sum: false, usd: false, value: (r) => r.stored.region },
    { heading: "ID Number", sum: false, usd: false, value: (r) => { const id = r.employeeId ? iqama.get(r.employeeId) : null; return id ? (sensitive ? id : mask(id)) : null; } },
    { heading: "Sponsorship", sum: false, usd: false, value: (r) => (r.stored.ownSponsorship ? "Ours" : "Client") },
    { heading: "Joining Date", sum: false, usd: false, value: (r) => (r.stored.joinedAt ? toDateOnly(r.stored.joinedAt) : null) },
    ...(has("salary") ? [{ heading: "Take Home Salary", sum: true, usd: true, value: (r: Row) => n(money(r.stored.salary.toString())) }] : []),
    { heading: "Workdays", sum: true, usd: false, value: (r) => Number(r.stored.workdays) },
    ...(has("salary") ? [{ heading: "Deductions", sum: true, usd: true, value: (r: Row) => n(money(r.stored.deductions.toString())) }] : []),
    ...(has("gasSupport") ? [svc("gasSupport", (c) => c.amounts.gasSupport)] : []),
    ...(has("kpi") ? [svc("kpi", (c) => c.amounts.kpi)] : []),
    ...(direct ? [{ heading: "Direct Total", sum: true, usd: true, value: (r: Row) => n(r.calc.directTotal) }] : []),
    ...services.filter((s) => !["salary", "gasSupport", "kpi"].includes(s)).map((s) => svc(s, (c) => c.amounts[s])),
    { heading: "Indirect Total", sum: true, usd: true, value: (r) => n(r.calc.indirectTotal) },
    { heading: "Total", sum: true, usd: true, value: (r) => n(r.calc.cost) },
    { heading: feeHeading, sum: true, usd: true, value: (r) => n(r.calc.serviceFee) },
    { heading: "Total", sum: true, usd: true, value: (r) => n(r.calc.total) },
    { heading: "VAT", sum: true, usd: true, value: (_r, x) => n(x.vat) },
    { heading: "Final Total-SAR", sum: true, usd: true, value: (r, x) => n(r.calc.total.plus(x.vat)) },
  ];
  const col = (heading: string, last = false) => (last ? columns.map((c) => c.heading).lastIndexOf(heading) : columns.findIndex((c) => c.heading === heading));

  const wb = new ExcelJS.Workbook();
  wb.creator = "EntityGate";
  const ws = wb.addWorksheet(invoice.type === "MONTHLY_EXPENSES" ? "Expenses invoice" : "Payroll invoice", { views: [{ state: "frozen", ySplit: 2, xSplit: 2 }] });
  const month = invoice.periodStart ? invoice.periodStart.toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(" ", "'") : "";
  const kind = invoice.type === "MONTHLY_EXPENSES" ? "Expenses" : "Invoice";
  ws.getCell("B1").value = `${invoice.client.displayName} - ${month} ${kind} Breakdown${invoice.number ? ` (${invoice.number})` : ""}`;
  ws.getCell("B1").font = { bold: true, size: 13 };
  const head = ws.addRow(columns.map((c) => c.heading));
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1A3A" } };
  head.alignment = { wrapText: true, vertical: "middle" };
  head.height = 32;

  let i = 0;
  for (const r of rows) {
    const vat = vatOf(r.calc.total, vatRate);
    const cells = columns.map((c) => c.value(r, { vat }));
    cells[0] = ++i;
    ws.addRow(cells);
  }
  // Recoverable expenses and account fees on the same invoice, so the file adds up to the invoice.
  for (const l of invoice.lines.filter((l) => !rows.some((r) => r.lineId === l.id))) {
    const amount = money(l.amount.toString());
    const vat = vatOf(amount, vatRate);
    const cells: (string | number | null)[] = columns.map(() => null);
    cells[0] = ++i;
    cells[1] = l.description;
    if (l.sourceType === "FEE") cells[col(feeHeading)] = n(amount);
    else {
      cells[col("Indirect Total")] = n(amount);
      cells[col("Total")] = n(amount);
    }
    cells[col("Total", true)] = n(amount);
    cells[col("VAT")] = n(vat);
    cells[col("Final Total-SAR")] = n(amount.plus(vat));
    ws.addRow(cells);
  }

  const first = 3;
  const last = 2 + i;
  const sar = ws.addRow(["Total-SAR"]);
  const usd = ws.addRow(["Total-USD"]);
  columns.forEach((c, idx) => {
    if (!c.sum) return;
    const letter = ws.getColumn(idx + 1).letter;
    sar.getCell(idx + 1).value = i ? { formula: `SUM(${letter}${first}:${letter}${last})` } : 0;
    if (c.usd) usd.getCell(idx + 1).value = { formula: `${letter}${sar.number}/${SAR_PER_USD}` };
  });
  ws.mergeCells(sar.number, 1, sar.number, 6);
  ws.mergeCells(usd.number, 1, usd.number, 6);
  for (const r of [sar, usd]) {
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0EEF2" } };
  }

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 28;
  columns.forEach((c, idx) => {
    if (idx < 2) return;
    const column = ws.getColumn(idx + 1);
    column.width = idx <= 5 ? 14 : 13;
    if (c.usd) column.numFmt = "#,##0.00";
  });
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${invoice.number ?? "draft"}-${kind.toLowerCase()}-breakdown.xlsx` };
}
