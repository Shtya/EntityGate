import "server-only";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { encrypt } from "@/server/crypto";
import { invalid, notFound } from "@/server/errors";
import type { Actor } from "@/server/rbac/policy";
import { dateOnly } from "@/server/util";
import { optDate, optEmail, optText, reqText } from "@/server/validation";
import { CLASSIFICATIONS } from "@/server/modules/employees/schema";
import { saveAttachment } from "@/server/modules/attachments/service";
import { todayDate } from "@/lib/dates";

export const EMPLOYEE_COLUMNS = ["employee_no", "name_en", "name_ar", "nationality", "iqama_no", "passport_no", "job_title", "email", "phone", "classification", "sponsor", "client_code", "effective_from"] as const;

const rowSchema = z.object({
  employee_no: reqText(30),
  name_en: reqText(120),
  name_ar: optText(120),
  nationality: optText(80),
  iqama_no: optText(20),
  passport_no: optText(20),
  job_title: optText(120),
  email: optEmail,
  phone: optText(32),
  classification: z.enum(CLASSIFICATIONS, { error: "validation.classification" }),
  sponsor: optText(120),
  client_code: optText(30),
  effective_from: optDate,
}).superRefine((row, ctx) => {
  if (row.client_code && !row.effective_from) ctx.addIssue({ code: "custom", path: ["effective_from"], message: "validation.required" });
});


export async function employeeTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Employees");
  sheet.addRow([...EMPLOYEE_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((c) => (c.width = 18));
  sheet.addRow(["EMP-10001", "Sample Employee", "موظف تجريبي", "Egyptian", "2345678901", "A12345678", "Engineer", "sample@example.com", "+966500000000", "SPONSORED", "EntityGate", "CL-0001", "2026-01-01"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Excel gives dates as Date objects and numbers as numbers; everything is normalized to text. */
function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim() || null;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("").trim() || null;
  }
  return String(value).trim() || null;
}

/** Dry run: parses and validates every row, writes nothing to employees. Identity numbers are encrypted at rest here too. */
export async function validateEmployeeImport(actor: Actor, file: File) {
  const attachment = await saveAttachment(actor, file);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw invalid("errors.importUnreadable");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw invalid("errors.importUnreadable");
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) => cellText(v)?.toLowerCase() ?? "");
  const missing = EMPLOYEE_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw invalid("errors.importColumns");

  const [clients, sponsors, existing] = await Promise.all([
    db.client.findMany({ select: { code: true } }),
    db.sponsor.findMany({ select: { name: true } }),
    db.employee.findMany({ select: { employeeNo: true } }),
  ]);
  const clientCodes = new Set(clients.map((c) => c.code));
  const sponsorNames = new Set(sponsors.map((s) => s.name));
  const existingNos = new Set(existing.map((e) => e.employeeNo));
  const seen = new Set<string>();

  const rows: { rowNo: number; payload: Record<string, string | null>; errors: { path: string; message: string }[] | null; result: string }[] = [];
  sheet.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const payload = Object.fromEntries(EMPLOYEE_COLUMNS.map((c) => [c, cellText(row.getCell(header.indexOf(c)).value)]));
    if (Object.values(payload).every((v) => v === null)) return;
    const parsed = rowSchema.safeParse(payload);
    const errors: { path: string; message: string }[] = parsed.success ? [] : parsed.error.issues.map((i) => ({ path: String(i.path[0]), message: i.message }));
    const no = payload.employee_no;
    if (no && seen.has(no)) errors.push({ path: "employee_no", message: "validation.duplicateInFile" });
    if (no) seen.add(no);
    if (payload.client_code && !clientCodes.has(payload.client_code)) errors.push({ path: "client_code", message: "validation.unknownClient" });
    if (payload.sponsor && !sponsorNames.has(payload.sponsor)) errors.push({ path: "sponsor", message: "validation.unknownSponsor" });
    const stored = { ...payload, iqama_no: encrypt(payload.iqama_no), passport_no: encrypt(payload.passport_no) };
    rows.push({ rowNo, payload: stored, errors: errors.length ? errors : null, result: errors.length ? "error" : no && existingNos.has(no) ? "update" : "create" });
  });
  if (rows.length === 0) throw invalid("errors.importEmpty");

  const errorRows = rows.filter((r) => r.errors).length;
  const job = await db.importJob.create({
    data: {
      type: "EMPLOYEES",
      fileAttachmentId: attachment.id,
      status: "VALIDATED",
      totalRows: rows.length,
      okRows: rows.length - errorRows,
      errorRows,
      createdById: actor.id,
      rows: { create: rows.map((r) => ({ rowNo: r.rowNo, payload: r.payload, errors: r.errors ?? undefined, result: r.result })) },
    },
  });
  await writeAudit(db, { actorId: actor.id, entityType: "import", entityId: job.id, action: "validate", after: { name: file.name, total: rows.length, errors: errorRows } });
  return { id: job.id };
}

export async function getImportJob(id: string) {
  const job = await db.importJob.findUnique({ where: { id }, include: { rows: { orderBy: { rowNo: "asc" }, select: { rowNo: true, payload: true, errors: true, result: true } } } });
  if (!job) throw notFound();
  return {
    ...job,
    // The preview never needs the identity numbers, so they don't leave the server.
    rows: job.rows.map((r) => {
      const p = r.payload as Record<string, string | null>;
      return { rowNo: r.rowNo, result: r.result, errors: r.errors as { path: string; message: string }[] | null, employeeNo: p.employee_no, name: p.name_en, classification: p.classification, clientCode: p.client_code };
    }),
  };
}

/** Commits valid rows in one transaction: all of them land, or none do. Rows with errors are left out and reported. */
export async function commitEmployeeImport(actor: Actor, id: string) {
  const job = await db.importJob.findUnique({ where: { id }, include: { rows: true } });
  if (!job) throw notFound();
  if (job.status !== "VALIDATED") throw invalid("errors.importCommitted");
  const [clients, sponsors] = await Promise.all([db.client.findMany({ select: { id: true, code: true } }), db.sponsor.findMany({ select: { id: true, name: true } })]);
  const clientId = new Map(clients.map((c) => [c.code, c.id]));
  const sponsorId = new Map(sponsors.map((s) => [s.name, s.id]));
  let created = 0;
  let updated = 0;
  await db.$transaction(
    async (tx) => {
      for (const row of job.rows) {
        if (row.errors) continue;
        const p = row.payload as Record<string, string | null>;
        const data = {
          nameEn: p.name_en!,
          nameAr: p.name_ar,
          nationality: p.nationality,
          iqamaNo: p.iqama_no,
          passportNo: p.passport_no,
          jobTitle: p.job_title,
          email: p.email,
          phone: p.phone,
          classification: p.classification as (typeof CLASSIFICATIONS)[number],
          sponsorId: p.sponsor ? sponsorId.get(p.sponsor) : null,
        };
        const before = await tx.employee.findUnique({ where: { employeeNo: p.employee_no! }, select: { id: true } });
        const employee = await tx.employee.upsert({
          where: { employeeNo: p.employee_no! },
          update: data,
          create: { ...data, employeeNo: p.employee_no!, status: "ACTIVE", joinedAt: p.effective_from ? dateOnly(p.effective_from) : todayDate() },
        });
        if (before) updated++;
        else created++;
        if (p.client_code && p.effective_from) {
          const target = clientId.get(p.client_code)!;
          const from = dateOnly(p.effective_from);
          const current = await tx.allocation.findFirst({ where: { employeeId: employee.id, effectiveTo: null } });
          if (!current) await tx.allocation.create({ data: { employeeId: employee.id, clientId: target, effectiveFrom: from } });
          else if (current.clientId !== target && current.effectiveFrom < from) {
            await tx.allocation.update({ where: { id: current.id }, data: { effectiveTo: from } });
            await tx.allocation.create({ data: { employeeId: employee.id, clientId: target, effectiveFrom: from } });
          }
        }
      }
      await tx.importJob.update({ where: { id }, data: { status: "COMMITTED", committedAt: new Date() } });
      await writeAudit(tx, { actorId: actor.id, entityType: "import", entityId: id, action: "commit", after: { created, updated } });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  return { created, updated };
}
