import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { decrypt, encrypt, mask } from "@/server/crypto";
import { forbidden, invalid, notFound } from "@/server/errors";
import { can, inScope, type Actor, type ClientScope } from "@/server/rbac/policy";
import { getClientScope } from "@/server/rbac/actor";
import { activeOn, dateOnly, dateOrNull, nextNumber, pad } from "@/server/util";
import { PAGE_SIZE } from "@/server/validation";
import { toDateOnly, todayDate } from "@/lib/dates";
import { headcountSummary, WORKFLOW_STEPS } from "@/lib/workforce";
import type { AllocationInput, CompensationInput, DocumentInput, EmployeeCreateInput, EmployeeUpdateInput, ListEmployeesQuery } from "./schema";

/** Employees are visible through a current allocation to a client in scope. */
export function employeeScope(scope: ClientScope): Prisma.EmployeeWhereInput {
  if (scope.kind === "all") return {};
  return { allocations: { some: { clientId: { in: scope.clientIds }, ...activeOn() } } };
}

export async function assertEmployeeAccess(employeeId: string, scope?: ClientScope) {
  const s = scope ?? (await getClientScope());
  if (s.kind === "all") return;
  const count = await db.allocation.count({ where: { employeeId, clientId: { in: s.clientIds }, ...activeOn() } });
  if (!count) throw forbidden();
}

export async function listEmployees(q: ListEmployeesQuery) {
  const scope = await getClientScope();
  const today = todayDate();
  const soon = new Date(today.getTime() + 60 * 86_400_000);
  const where: Prisma.EmployeeWhereInput = {
    archivedAt: null,
    ...employeeScope(scope),
    status: q.status,
    classification: q.classification,
    sponsorId: q.sponsor || undefined,
    ...(q.client ? { allocations: { some: { clientId: q.client, ...activeOn(today) } } } : {}),
    ...(q.q ? { OR: [{ nameEn: { contains: q.q, mode: "insensitive" } }, { nameAr: { contains: q.q } }, { employeeNo: { contains: q.q, mode: "insensitive" } }] } : {}),
    ...(q.attention === "unallocated" ? { status: { in: ["ONBOARDING", "ACTIVE"] }, allocations: { none: activeOn(today) } } : {}),
  };
  if (q.attention === "expiring") {
    const docs = await db.document.findMany({ where: { ownerType: "EMPLOYEE", archivedAt: null, expiryDate: { lte: soon } }, select: { ownerId: true } });
    where.id = { in: docs.map((d) => d.ownerId) };
  }
  const [rows, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: { nameEn: "asc" },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        employeeNo: true,
        nameEn: true,
        nameAr: true,
        jobTitle: true,
        classification: true,
        status: true,
        sponsor: { select: { name: true } },
        allocations: { where: activeOn(today), take: 1, select: { client: { select: { id: true, displayName: true } }, location: { select: { name: true } } } },
      },
    }),
    db.employee.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  const docs = await db.document.findMany({
    where: { ownerType: "EMPLOYEE", ownerId: { in: ids }, archivedAt: null, expiryDate: { not: null } },
    orderBy: { expiryDate: "asc" },
    select: { ownerId: true, type: true, expiryDate: true },
  });
  const nextExpiry = new Map<string, { type: string; expiryDate: Date }>();
  for (const d of docs) if (!nextExpiry.has(d.ownerId)) nextExpiry.set(d.ownerId, { type: d.type, expiryDate: d.expiryDate! });
  return { rows: rows.map((r) => ({ ...r, nextExpiry: nextExpiry.get(r.id) ?? null })), total, page: q.page };
}

/** Headcount from active allocations only (BR-02), limited to what the viewer may see. */
export async function workforceSummary(filter?: { clientIds?: string[]; day?: Date }) {
  const scope = await getClientScope();
  const clientFilter = scope.kind === "all" ? filter?.clientIds : scope.clientIds.filter((c) => !filter?.clientIds || filter.clientIds.includes(c));
  const allocations = await db.allocation.findMany({
    where: { ...activeOn(filter?.day ?? todayDate()), ...(clientFilter ? { clientId: { in: clientFilter } } : {}), employee: { archivedAt: null, status: { not: "EXITED" } } },
    select: { employee: { select: { classification: true, sponsor: { select: { name: true } } } }, client: { select: { id: true, displayName: true } } },
  });
  const count = (key: (a: (typeof allocations)[number]) => string) => {
    const m = new Map<string, number>();
    for (const a of allocations) m.set(key(a), (m.get(key(a)) ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value);
  };
  return {
    ...headcountSummary(allocations.map((a) => ({ classification: a.employee.classification }))),
    bySponsor: count((a) => a.employee.sponsor?.name ?? "—"),
    byClient: count((a) => a.client.displayName),
    clientIds: Object.fromEntries(allocations.map((a) => [a.client.displayName, a.client.id])) as Record<string, string>,
  };
}

export async function employeeStats() {
  const scope = await getClientScope();
  const base = { archivedAt: null, ...employeeScope(scope) };
  const today = todayDate();
  const soon = new Date(today.getTime() + 60 * 86_400_000);
  const [active, onboarding, offboarding, expiringDocs] = await Promise.all([
    db.employee.count({ where: { ...base, status: "ACTIVE" } }),
    db.employee.count({ where: { ...base, status: "ONBOARDING" } }),
    db.employee.count({ where: { ...base, status: "OFFBOARDING" } }),
    db.document.findMany({ where: { ownerType: "EMPLOYEE", archivedAt: null, expiryDate: { lte: soon } }, distinct: ["ownerId"], select: { ownerId: true } }),
  ]);
  const expiring = scope.kind === "all" ? expiringDocs.length : await db.employee.count({ where: { ...base, id: { in: expiringDocs.map((d) => d.ownerId) } } });
  return { active, onboarding, offboarding, expiring };
}

export async function getEmployee(actor: Actor, id: string) {
  await assertEmployeeAccess(id);
  const employee = await db.employee.findFirst({
    where: { id, archivedAt: null },
    include: {
      sponsor: { select: { id: true, name: true } },
      allocations: {
        orderBy: { effectiveFrom: "desc" },
        include: { client: { select: { id: true, displayName: true } }, location: { select: { name: true } }, manager: { select: { name: true } } },
      },
      compensations: { orderBy: { effectiveFrom: "desc" } },
      workflows: { orderBy: { createdAt: "desc" }, include: { steps: { orderBy: { position: "asc" } } } },
    },
  });
  if (!employee) throw notFound();
  const documents = await db.document.findMany({
    where: { ownerType: "EMPLOYEE", ownerId: id, archivedAt: null },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }],
    include: { attachment: { select: { id: true, filename: true } } },
  });

  // Sensitive fields leave the service decrypted only for people allowed to see them (SRS §3).
  const sensitive = can(actor, "employee:read_sensitive");
  const iqama = decrypt(employee.iqamaNo);
  const passport = decrypt(employee.passportNo);
  return {
    ...employee,
    iqamaNo: sensitive ? iqama : mask(iqama),
    passportNo: sensitive ? passport : mask(passport),
    compensations: can(actor, "compensation:read") ? employee.compensations : [],
    documents,
    sensitive,
  };
}

async function startWorkflow(tx: Tx, employeeId: string, type: "JOINER" | "TRANSFER" | "RENEWAL" | "EXIT") {
  return tx.lifecycleWorkflow.create({
    data: { employeeId, type, steps: { create: WORKFLOW_STEPS[type].map((label, position) => ({ label, position })) } },
  });
}

export async function createEmployee(actor: Actor, input: EmployeeCreateInput) {
  const scope = await getClientScope();
  // Without "all clients" scope the new record must land on one of your clients, or you'd lose sight of it.
  if (scope.kind !== "all" && !input.clientId) throw invalid("errors.validation", [{ path: "clientId", message: "validation.required" }]);
  if (input.clientId && !inScope(scope, input.clientId)) throw forbidden();
  const { clientId, effectiveFrom, employeeNo, iqamaNo, passportNo, dateOfBirth, joinedAt, ...rest } = input;
  return db.$transaction(async (tx) => {
    const number = employeeNo || `EMP-${pad(await nextNumber(tx, "EMP"), 5)}`;
    const employee = await tx.employee.create({
      data: { ...rest, employeeNo: number, iqamaNo: encrypt(iqamaNo), passportNo: encrypt(passportNo), dateOfBirth: dateOrNull(dateOfBirth), joinedAt: dateOrNull(joinedAt), status: "ONBOARDING" },
    });
    await startWorkflow(tx, employee.id, "JOINER");
    if (clientId) {
      await tx.allocation.create({ data: { employeeId: employee.id, clientId, effectiveFrom: dateOrNull(effectiveFrom) ?? todayDate() } });
    }
    // Identity numbers stay out of the audit trail on purpose.
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: employee.id, action: "create", after: { name: input.nameEn, employeeNo: number } });
    return { id: employee.id };
  });
}

export async function updateEmployee(actor: Actor, id: string, input: EmployeeUpdateInput) {
  await assertEmployeeAccess(id);
  const before = await db.employee.findUnique({ where: { id } });
  if (!before) throw notFound();
  const { iqamaNo, passportNo, dateOfBirth, joinedAt, ...rest } = input;
  const canSeeIds = can(actor, "employee:read_sensitive");
  return db.$transaction(async (tx) => {
    const after = await tx.employee.update({
      where: { id },
      data: {
        ...rest,
        dateOfBirth: dateOrNull(dateOfBirth),
        joinedAt: dateOrNull(joinedAt),
        // People who only see a masked value can't overwrite the real number with the mask.
        ...(canSeeIds ? { iqamaNo: encrypt(iqamaNo), passportNo: encrypt(passportNo) } : {}),
      },
    });
    const strip = (e: typeof before) => ({ ...e, iqamaNo: undefined, passportNo: undefined });
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: id, action: "update", before: strip(before), after: strip(after) });
    return { id };
  });
}

/** A new placement closes the current one the same day, so an employee never has a gap or overlap. */
export async function allocate(actor: Actor, employeeId: string, input: AllocationInput) {
  const scope = await getClientScope();
  if (!inScope(scope, input.clientId)) throw forbidden();
  const from = dateOnly(input.effectiveFrom);
  const client = await db.client.findUnique({ where: { id: input.clientId }, select: { displayName: true } });
  if (!client) throw notFound();
  return db.$transaction(async (tx) => {
    const current = await tx.allocation.findFirst({ where: { employeeId, effectiveTo: null } });
    if (current) {
      if (!inScope(scope, current.clientId)) throw forbidden();
      if (current.effectiveFrom >= from) throw invalid("errors.validation", [{ path: "effectiveFrom", message: "validation.afterCurrentAllocation" }]);
      await tx.allocation.update({ where: { id: current.id }, data: { effectiveTo: from } });
    }
    const row = await tx.allocation.create({
      data: { employeeId, clientId: input.clientId, locationId: input.locationId, managerUserId: input.managerUserId, effectiveFrom: from, billable: input.billable ?? true },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: employeeId, action: "allocate", after: { name: client.displayName, from: input.effectiveFrom } });
    return { id: row.id };
  });
}

export async function addCompensation(actor: Actor, employeeId: string, input: CompensationInput) {
  await assertEmployeeAccess(employeeId);
  const from = dateOnly(input.effectiveFrom);
  return db.$transaction(async (tx) => {
    const current = await tx.compensation.findFirst({ where: { employeeId, effectiveTo: null } });
    if (current) {
      if (current.effectiveFrom >= from) throw invalid("errors.validation", [{ path: "effectiveFrom", message: "validation.afterCurrentAllocation" }]);
      await tx.compensation.update({ where: { id: current.id }, data: { effectiveTo: from } });
    }
    const row = await tx.compensation.create({
      data: {
        employeeId,
        effectiveFrom: from,
        basic: input.basic,
        housing: input.housing ?? "0",
        transport: input.transport ?? "0",
        other: input.other ?? "0",
        gosiEmployer: input.gosiEmployer ?? "0",
        insuranceMonthly: input.insuranceMonthly ?? "0",
      },
    });
    // The fact of the change is audited; amounts stay out of the log, which more roles can read.
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: employeeId, action: "compensation_change", after: { from: input.effectiveFrom } });
    return { id: row.id };
  });
}

export async function addDocument(actor: Actor, input: DocumentInput) {
  if (input.ownerType === "EMPLOYEE") await assertEmployeeAccess(input.ownerId);
  if (input.ownerType === "CLIENT" && !inScope(await getClientScope(), input.ownerId)) throw forbidden();
  const row = await db.document.create({
    data: { ...input, number: input.number ? input.number : null, issueDate: dateOrNull(input.issueDate), expiryDate: dateOrNull(input.expiryDate) },
  });
  await writeAudit(db, { actorId: actor.id, entityType: input.ownerType.toLowerCase(), entityId: input.ownerId, action: "document_add", after: { name: input.type, expiry: input.expiryDate } });
  return { id: row.id };
}

export async function archiveDocument(actor: Actor, id: string) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw notFound();
  if (doc.ownerType === "EMPLOYEE") await assertEmployeeAccess(doc.ownerId);
  if (doc.ownerType === "CLIENT" && !inScope(await getClientScope(), doc.ownerId)) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, { actorId: actor.id, entityType: doc.ownerType.toLowerCase(), entityId: doc.ownerId, action: "document_archive", after: { name: doc.type } });
  });
  return { id };
}

export async function clientDocuments(clientId: string) {
  return db.document.findMany({
    where: { ownerType: "CLIENT", ownerId: clientId, archivedAt: null },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }],
    include: { attachment: { select: { id: true, filename: true } } },
  });
}

export async function setStep(actor: Actor, stepId: string, done: boolean) {
  const step = await db.workflowStep.findUnique({ where: { id: stepId }, include: { workflow: true } });
  if (!step) throw notFound();
  await assertEmployeeAccess(step.workflow.employeeId);
  return db.$transaction(async (tx) => {
    await tx.workflowStep.update({ where: { id: stepId }, data: { status: done ? "DONE" : "PENDING", completedAt: done ? new Date() : null } });
    const open = await tx.workflowStep.count({ where: { workflowId: step.workflowId, status: { in: ["PENDING", "IN_PROGRESS"] } } });
    await tx.lifecycleWorkflow.update({ where: { id: step.workflowId }, data: { status: open ? "OPEN" : "COMPLETED", completedAt: open ? null : new Date() } });
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: step.workflow.employeeId, action: "workflow_step", after: { step: step.label, done } });
    return { id: stepId };
  });
}

/** WF-02: joining the headcount needs a placement. */
export async function activateEmployee(actor: Actor, id: string) {
  await assertEmployeeAccess(id);
  const employee = await db.employee.findUnique({ where: { id }, select: { status: true, joinedAt: true } });
  if (!employee) throw notFound();
  if (employee.status !== "ONBOARDING") throw invalid("errors.badTransition");
  const allocations = await db.allocation.count({ where: { employeeId: id, OR: [{ effectiveTo: null }, { effectiveTo: { gt: todayDate() } }] } });
  if (!allocations) throw invalid("errors.employeeNeedsAllocation");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { status: "ACTIVE", joinedAt: employee.joinedAt ?? todayDate() } });
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: id, action: "status_change", before: { status: "ONBOARDING" }, after: { status: "ACTIVE" } });
  });
  return { id };
}

export async function startExit(actor: Actor, id: string) {
  await assertEmployeeAccess(id);
  const employee = await db.employee.findUnique({ where: { id }, select: { status: true } });
  if (!employee) throw notFound();
  if (employee.status !== "ACTIVE") throw invalid("errors.badTransition");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { status: "OFFBOARDING" } });
    await startWorkflow(tx, id, "EXIT");
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: id, action: "status_change", before: { status: "ACTIVE" }, after: { status: "OFFBOARDING" } });
  });
  return { id };
}

/** effective_to is exclusive, so the last working day still counts toward billing. */
export async function completeExit(actor: Actor, id: string, lastWorkingDay: string) {
  await assertEmployeeAccess(id);
  const employee = await db.employee.findUnique({ where: { id }, select: { status: true } });
  if (!employee) throw notFound();
  if (employee.status !== "OFFBOARDING") throw invalid("errors.badTransition");
  const last = dateOnly(lastWorkingDay);
  const end = new Date(last.getTime() + 86_400_000);
  await db.$transaction(async (tx) => {
    const current = await tx.allocation.findFirst({ where: { employeeId: id, effectiveTo: null } });
    if (current) {
      if (current.effectiveFrom >= end) throw invalid("errors.validation", [{ path: "lastWorkingDay", message: "validation.endAfterStart" }]);
      await tx.allocation.update({ where: { id: current.id }, data: { effectiveTo: end } });
    }
    await tx.employee.update({ where: { id }, data: { status: "EXITED", exitedAt: last } });
    await writeAudit(tx, { actorId: actor.id, entityType: "employee", entityId: id, action: "status_change", before: { status: "OFFBOARDING" }, after: { status: "EXITED", lastWorkingDay: toDateOnly(last) } });
  });
  return { id };
}

export async function sponsorOptions() {
  const rows = await db.sponsor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rows.map((s) => ({ value: s.id, label: s.name }));
}

export async function locationOptions() {
  const rows = await db.location.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rows.map((l) => ({ value: l.id, label: l.name }));
}
