import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid } from "@/server/errors";
import { isAdmin, type Actor } from "@/server/rbac/policy";
import { verifyPassword } from "@/lib/password";
import { storage } from "@/server/modules/attachments/storage";

export const CONFIRM_PHRASE = "CLEAR";
const CLEARED_ACTION = "system_data_cleared";

export const clearDataSchema = z.object({
  confirm: z.string({ error: "system.typePhrase" }).trim().refine((v) => v.toUpperCase() === CONFIRM_PHRASE, "system.typePhrase"),
  password: z.string({ error: "validation.required" }).min(1, "validation.required").max(200),
});

/**
 * Everything people entered while trying the system. Postgres refuses to truncate a table while a
 * table outside this list still points at it, so a new table can't be half-cleared by accident.
 * Kept on purpose: roles and permissions, regions, locations, sponsors, categories, holidays, SLA
 * policies and reminder rules, which are setup rather than demo records.
 */
const BUSINESS_TABLES = [
  "audit_events", "notification_deliveries", "notifications", "export_logs", "import_rows", "import_jobs", "integration_syncs",
  "payment_allocations", "payments", "payroll_items", "payroll_runs", "expenses", "invoice_lines", "invoices", "billing_runs", "accounting_periods", "payables",
  "escalation_updates", "escalations", "case_comments", "case_events", "cases", "task_checklist_items", "task_comments", "tasks",
  "workflow_steps", "lifecycle_workflows", "documents", "compensations", "allocations", "employees",
  "rate_cards", "contracts", "account_assignments", "client_contacts", "clients",
  "attachments", "attachment_blobs", "number_sequences", "team_members", "teams",
] as const;

/** Runs inside the caller's transaction, so a failure anywhere leaves the data exactly as it was. */
export async function wipeBusinessData(tx: Tx, keepUserId: string) {
  const files = await tx.attachment.findMany({ select: { storageKey: true } });
  const quoted = BUSINESS_TABLES.map((t) => `"${t}"`).join(", ");
  // eslint-disable-next-line no-restricted-syntax -- table names come from the constant above, never from input
  await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoted}`);
  const users = await tx.user.deleteMany({ where: { id: { not: keepUserId } } });
  return { users: users.count, storageKeys: files.map((f) => f.storageKey) };
}

export async function systemStatus() {
  const [cleared, clients, employees, invoices, users] = await Promise.all([
    db.auditEvent.findFirst({ where: { action: CLEARED_ACTION }, orderBy: { createdAt: "desc" }, select: { createdAt: true, actor: { select: { name: true } } } }),
    db.client.count(),
    db.employee.count(),
    db.invoice.count(),
    db.user.count(),
  ]);
  return { clearedAt: cleared?.createdAt ?? null, clearedBy: cleared?.actor?.name ?? null, clients, employees, invoices, users };
}

/**
 * The hand-over step: wipes the demo records and every account but the administrator doing it, so
 * the company starts clean. It works once. Afterwards the data is real, so the action is refused.
 */
export async function clearDemoData(actor: Actor, input: z.infer<typeof clearDataSchema>) {
  if (!isAdmin(actor)) throw forbidden("errors.adminOnly");
  if (await db.auditEvent.findFirst({ where: { action: CLEARED_ACTION }, select: { id: true } })) throw conflict("system.alreadyCleared");

  const account = await db.account.findFirst({ where: { userId: actor.id, providerId: "credential" }, select: { password: true } });
  if (!account?.password || !(await verifyPassword({ hash: account.password, password: input.password }))) {
    await writeAudit(db, { actorId: actor.id, entityType: "system", entityId: "data", action: "clear_denied", after: { reason: "wrong_password" } });
    throw invalid("errors.validation", [{ path: "password", message: "system.wrongPassword" }]);
  }

  const result = await db.$transaction(
    async (tx) => {
      const counts = { clients: await tx.client.count(), employees: await tx.employee.count(), invoices: await tx.invoice.count() };
      const wiped = await wipeBusinessData(tx, actor.id);
      // The first entry in the fresh audit log, and what stops this running twice.
      await writeAudit(tx, { actorId: actor.id, entityType: "system", entityId: "data", action: CLEARED_ACTION, after: { ...counts, users: wiped.users } });
      return { ...counts, users: wiped.users, storageKeys: wiped.storageKeys };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  // Files come last: the data is already gone, and a stray file left behind is harmless.
  await Promise.allSettled(result.storageKeys.map((key) => storage.delete(key)));
  return { clients: result.clients, employees: result.employees, invoices: result.invoices, users: result.users };
}
