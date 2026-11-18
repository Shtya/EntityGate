import "server-only";
import { z } from "zod";
import { optMoney4 } from "@/server/validation";
import type { Compensation, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { forbidden, invalid, notFound } from "@/server/errors";
import { getClientScope } from "@/server/rbac/actor";
import { inScope, type Actor } from "@/server/rbac/policy";
import { billedWorkdays, employeeBreakdown, INVOICE_PARTS, ONE_OFF_CHARGES, SERVICES, STANDING_CHARGES, type Charge, type FeeModel, type InvoicePart, type Service, type ServiceRules } from "@/lib/breakdown";
import { overlapDays, periodBounds } from "@/lib/dates";
import { invoiceTotals } from "@/lib/finance";
import { add, money } from "@/lib/money";

// ─────────────────────────── Client service settings ───────────────────────────

export const serviceRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        service: z.enum(SERVICES),
        enabled: z.boolean(),
        part: z.enum(INVOICE_PARTS),
        feeType: z.enum(["CONTRACT", "PERCENT", "FIXED"]),
        /** A percentage as entered (11 = 11%) or an amount. */
        feeValue: optMoney4,
      }),
    )
    .max(SERVICES.length),
});

/** A client's settings for every service, with the defaults filled in for services never set. */
export async function clientServiceRules(clientId: string): Promise<ServiceRules> {
  const rows = await db.clientServiceRule.findMany({ where: { clientId } });
  return Object.fromEntries(
    rows
      .filter((r) => (SERVICES as readonly string[]).includes(r.service))
      .map((r) => [r.service, { enabled: r.enabled, part: r.part as InvoicePart, fee: r.feeType && r.feeValue !== null ? { type: r.feeType as "PERCENT" | "FIXED", value: r.feeValue.toString() } : null }]),
  );
}

/** Saves a client's service settings. They apply to the next billing run; issued invoices keep theirs. */
export async function setClientServiceRules(actor: Actor, clientId: string, input: z.infer<typeof serviceRulesSchema>) {
  if (!inScope(await getClientScope(), clientId)) throw forbidden();
  const errors = input.rules.flatMap((r, i) => (r.feeType !== "CONTRACT" && r.feeValue === null ? [{ path: `rules.${i}.feeValue`, message: "validation.required" }] : []));
  if (errors.length) throw invalid("errors.validation", errors);
  await db.$transaction(async (tx) => {
    for (const r of input.rules) {
      const fee =
        r.feeType === "CONTRACT"
          ? { feeType: null, feeValue: null }
          : // Percentages are entered as 11 and stored as 0.11, like the contract's rates.
            { feeType: r.feeType, feeValue: r.feeType === "PERCENT" ? money(r.feeValue!).dividedBy(100).toString() : r.feeValue };
      await tx.clientServiceRule.upsert({
        where: { clientId_service: { clientId, service: r.service } },
        create: { clientId, service: r.service, enabled: r.enabled, part: r.part, ...fee },
        update: { enabled: r.enabled, part: r.part, ...fee },
      });
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: clientId, action: "service_rules", after: { services: input.rules.length, off: input.rules.filter((r) => !r.enabled).map((r) => r.service), expenses: input.rules.filter((r) => r.enabled && r.part === "EXPENSES").map((r) => r.service) } });
  });
  return { id: clientId };
}

// ─────────────────────────── Building and editing rows ───────────────────────────

/** Up to four decimals and optional, so a yearly cost spread over 12 months keeps the sheet's precision. */
const optAmount4 = optMoney4;

export const breakdownEditSchema = z.object({
  workdays: z.coerce.number({ error: "validation.number" }).min(0).max(30),
  deductions: optAmount4,
  gasSupport: optAmount4,
  kpi: optAmount4,
  medical: optAmount4,
  gosi: optAmount4,
  iqamaRenewal: optAmount4,
  exitReentry: optAmount4,
  flightTicket: optAmount4,
  iqamaTransfer: optAmount4,
  adminFee: optAmount4,
  dependantsFees: optAmount4,
  ajeer: optAmount4,
  sponsorshipTransfer: optAmount4,
  newVisa: optAmount4,
  payout: optAmount4,
  other: optAmount4,
});
export type BreakdownEdit = z.infer<typeof breakdownEditSchema>;
type Editable = "deductions" | "gasSupport" | "kpi" | Charge;
/** Which stored amount each editable field belongs to, so an edit can't touch a service that isn't on this invoice. */
const FIELD_SERVICE: Record<Editable, Service> = {
  deductions: "salary",
  gasSupport: "gasSupport",
  kpi: "kpi",
  ...(Object.fromEntries([...STANDING_CHARGES, ...ONE_OFF_CHARGES].map((k) => [k, k])) as Record<Charge, Service>),
};

/** The take-home part of a pay record: what the sheet calls "Take Home Salary". */
const takeHome = (c: Pick<Compensation, "basic" | "housing" | "transport" | "other">) => add(c.basic.toString(), c.housing.toString(), c.transport.toString(), c.other.toString());

type Card = { feePercent: Prisma.Decimal | null; feeIndirectPercent: Prisma.Decimal | null; feePerHead: Prisma.Decimal | null; feePerDay: Prisma.Decimal | null; billEndOfService: boolean };
type Placement = { id: string; effectiveFrom: Date; effectiveTo: Date | null; location: { region: { name: string } } | null; employee: { id: string; nameEn: string; joinedAt: Date | null; compensations: Compensation[] } };

/**
 * One employee's row for a month and one of the client's invoices: salary weighted across any pay
 * change, standing charges from the latest pay record, and the contract's fee terms and the
 * client's service rules saved with it, so a draft can be recalculated exactly.
 */
export function placementRow(a: Placement, period: string, model: FeeModel, card: Card, rules: ServiceRules = {}, part: InvoicePart = "PAYROLL") {
  const { start, end, days } = periodBounds(period);
  const from = a.effectiveFrom > start ? a.effectiveFrom : start;
  const to = a.effectiveTo && a.effectiveTo < end ? a.effectiveTo : end;
  const daysActive = overlapDays(a.effectiveFrom, a.effectiveTo, period);
  if (daysActive === 0) return null;
  // Pay records overlapping the days on this client, weighted by how many of those days each covers.
  const pays = a.employee.compensations
    .map((c) => {
      const s = c.effectiveFrom > from ? c.effectiveFrom : from;
      const e = c.effectiveTo && c.effectiveTo < to ? c.effectiveTo : to;
      return { c, days: Math.max(0, Math.round((e.getTime() - s.getTime()) / 86_400_000)) };
    })
    .filter((p) => p.days > 0)
    .sort((x, y) => x.c.effectiveFrom.getTime() - y.c.effectiveFrom.getTime());
  const covered = pays.reduce((n, p) => n + p.days, 0);
  const salary = covered ? pays.reduce((sum, p) => sum.plus(takeHome(p.c).times(p.days)), money(0)).dividedBy(covered) : money(0);
  const latest = pays.at(-1)?.c;
  const charges: Partial<Record<Charge, string>> = latest
    ? {
        medical: latest.insuranceMonthly.toString(),
        gosi: latest.gosiEmployer.toString(),
        iqamaRenewal: latest.iqamaRenewal.toString(),
        exitReentry: latest.exitReentry.toString(),
        flightTicket: latest.flightTicket.toString(),
        iqamaTransfer: latest.iqamaTransfer.toString(),
        adminFee: latest.adminFee.toString(),
        dependantsFees: latest.dependantsFees.toString(),
        ajeer: latest.ajeer.toString(),
      }
    : {};
  const workdays = billedWorkdays(daysActive, days);
  const data = {
    employeeName: a.employee.nameEn,
    region: a.location?.region.name ?? null,
    joinedAt: a.employee.joinedAt,
    salary: salary.toDecimalPlaces(4).toString(),
    workdays: String(workdays),
    ...charges,
    billEos: card.billEndOfService,
    feeModel: model,
    directRate: card.feePercent?.toString() ?? null,
    indirectRate: card.feeIndirectPercent?.toString() ?? null,
    perHead: card.feePerHead?.toString() ?? null,
    perDay: card.feePerDay?.toString() ?? null,
    part,
    rules: JSON.parse(JSON.stringify(rules)) as Prisma.InputJsonValue,
  };
  return { data, result: compute(data), workdays, missingPay: salary.isZero() };
}

type Stored = { salary: unknown; workdays: unknown; deductions?: unknown; gasSupport?: unknown; kpi?: unknown; billEos: boolean; feeModel: string; directRate?: unknown; indirectRate?: unknown; perHead?: unknown; perDay?: unknown; part?: unknown; rules?: unknown } & Partial<Record<Charge, unknown>>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Recalculates a stored row: the one formula behind billing runs, edits and the Excel file. */
export function compute(b: Stored) {
  return employeeBreakdown({
    salary: String(b.salary),
    workdays: String(b.workdays),
    deductions: str(b.deductions),
    gasSupport: str(b.gasSupport),
    kpi: str(b.kpi),
    charges: Object.fromEntries([...STANDING_CHARGES, ...ONE_OFF_CHARGES].map((k) => [k, str(b[k])])),
    billEos: b.billEos,
    fee: { model: b.feeModel as FeeModel, directRate: str(b.directRate), indirectRate: str(b.indirectRate), perHead: str(b.perHead), perDay: str(b.perDay) },
    rules: (b.rules ?? {}) as ServiceRules,
    part: (b.part ?? "PAYROLL") as InvoicePart,
  });
}

/** Changes one employee's month on a draft invoice: days worked, deductions, extras, one-off charges. */
export async function editBreakdown(actor: Actor, invoiceId: string, lineId: string, input: BreakdownEdit) {
  const line = await db.invoiceLine.findFirst({ where: { id: lineId, invoiceId }, include: { breakdown: true, invoice: { select: { status: true, clientId: true, vatRate: true } } } });
  if (!line?.breakdown) throw notFound();
  if (!inScope(await getClientScope(), line.invoice.clientId)) throw forbidden();
  if (!["DRAFT", "PENDING_APPROVAL"].includes(line.invoice.status)) throw invalid("errors.invoiceLocked");
  const included = compute(line.breakdown).included;
  // Only the services this invoice shows can change; the rest stay as they were.
  const changes: Record<string, string> = { workdays: String(input.workdays) };
  for (const [field, service] of Object.entries(FIELD_SERVICE) as [Editable, Service][]) if (included.includes(service)) changes[field] = input[field] ?? "0";
  const r = compute({ ...line.breakdown, ...changes });
  await db.$transaction(async (tx) => {
    await tx.invoiceLineBreakdown.update({ where: { lineId }, data: changes });
    await tx.invoiceLine.update({
      where: { id: lineId },
      data: { description: `${line.breakdown!.employeeName} (${input.workdays}/30)`, quantity: money(input.workdays).dividedBy(30).toDecimalPlaces(4).toString(), unitAmount: r.total.toString(), amount: r.total.toString(), costAmount: r.cost.toString() },
    });
    const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { amount: true } });
    const totals = invoiceTotals(lines.map((l) => l.amount.toString()), line.invoice.vatRate.toString());
    await tx.invoice.update({ where: { id: invoiceId }, data: { subtotal: totals.subtotal.toString(), vatAmount: totals.vat.toString(), total: totals.total.toString() } });
    await writeAudit(tx, { actorId: actor.id, entityType: "invoice", entityId: invoiceId, action: "breakdown_edit", before: { employee: line.breakdown!.employeeName, amount: line.amount.toString() }, after: { amount: r.total.toString(), workdays: input.workdays } });
  });
  return { id: lineId, amount: r.total.toFixed(2) };
}

/** Every row of an invoice's breakdown with its calculated columns, in invoice order. */
export async function invoiceBreakdown(invoiceId: string) {
  const lines = await db.invoiceLine.findMany({ where: { invoiceId, breakdown: { isNot: null } }, orderBy: { position: "asc" }, include: { breakdown: true } });
  const rows = lines.map((l) => ({ lineId: l.id, employeeId: l.employeeId, stored: l.breakdown!, calc: compute(l.breakdown!) }));
  // The columns to show: services any row on this invoice carries.
  const services = SERVICES.filter((s) => rows.some((r) => r.calc.included.includes(s)));
  return { rows, services };
}
