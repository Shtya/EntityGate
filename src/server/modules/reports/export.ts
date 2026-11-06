import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import type { Actor } from "@/server/rbac/policy";
import { toDateOnly } from "@/lib/dates";
import type { ReportDef, ReportRow, ReportValue } from "./definitions";

type T = { (key: string): string; has(key: string): boolean };

const isUtcMidnight = (d: Date) => d.getTime() % 86_400_000 === 0;

/** A cell's translated text value, with dates as YYYY-MM-DD so they sort and import cleanly. */
export function reportCell(def: ReportDef, key: string, value: ReportValue, t: T): ReportValue {
  const col = def.columns.find((c) => c.key === key)!;
  if (value === null) return null;
  if (value instanceof Date) return isUtcMidnight(value) ? toDateOnly(value) : value.toISOString().slice(0, 10);
  if (col.enumNs && t.has(`${col.enumNs}.${value}`)) return t(`${col.enumNs}.${value}`);
  return value;
}

/** Spreadsheets run cells starting with these as formulas, so text from users is neutralized. */
export function safeCsvText(s: string) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function csvEscape(v: string) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(def: ReportDef, rows: ReportRow[], t: T) {
  const lines = [def.columns.map((c) => csvEscape(t(c.label))).join(",")];
  for (const row of rows) {
    lines.push(
      def.columns
        .map((c) => {
          const v = reportCell(def, c.key, row[c.key], t);
          if (v === null) return "";
          const numeric = c.type === "money" || c.type === "int" || c.type === "percent";
          return csvEscape(numeric ? String(v) : safeCsvText(String(v)));
        })
        .join(","),
    );
  }
  // The BOM makes Excel read Arabic as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx(def: ReportDef, rows: ReportRow[], t: T, rtl: boolean) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t(`reports.name_${def.key}`).slice(0, 31), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }] });
  sheet.addRow(def.columns.map((c) => t(c.label)));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(
      def.columns.map((c) => {
        const v = reportCell(def, c.key, row[c.key], t);
        if (v === null) return null;
        if (c.type === "money" || c.type === "int" || c.type === "percent") return Number(v);
        return safeCsvText(String(v));
      }),
    );
  }
  def.columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = c.type === "money" ? 16 : 24;
    if (c.type === "money") col.numFmt = "#,##0.00";
    if (c.type === "percent") col.numFmt = "0.0%";
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Every file that leaves the system is recorded: who, what, which filters, how many rows. */
export async function logExport(actor: Actor, report: string, format: string, filters: object, rowCount: number) {
  await db.$transaction(async (tx) => {
    const row = await tx.exportLog.create({ data: { userId: actor.id, report, format, filters: JSON.parse(JSON.stringify(filters)), rowCount } });
    await writeAudit(tx, { actorId: actor.id, entityType: "export", entityId: row.id, action: "export", after: { name: report, format, rows: rowCount } });
  });
}
