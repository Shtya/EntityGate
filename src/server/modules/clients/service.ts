import "server-only";
import type { ClientStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { can, clientRowFilter, inScope, type Actor, type ClientScope } from "@/server/rbac/policy";
import { getClientScope } from "@/server/rbac/actor";
import { activeOn, dateOnly, dateOrNull, nextNumber, pad, percentToFraction } from "@/server/util";
import { PAGE_SIZE } from "@/server/validation";
import { todayDate } from "@/lib/dates";
import type { ClientInput, ContractInput, ListClientsQuery, RateCardInput } from "./schema";

/** Allowed lifecycle moves (ACC-05). */
const TRANSITIONS: Record<ClientStatus, ClientStatus[]> = {
  PROSPECT: ["ONBOARDING", "EXITED"],
  ONBOARDING: ["ACTIVE", "EXITED"],
  ACTIVE: ["SUSPENDED", "EXITED"],
  SUSPENDED: ["ACTIVE", "EXITED"],
  EXITED: [],
};
export const nextStatuses = (status: ClientStatus) => TRANSITIONS[status];

export async function assertClientAccess(clientId: string, scope?: ClientScope) {
  if (!inScope(scope ?? (await getClientScope()), clientId)) throw forbidden();
}

export async function listClients(q: ListClientsQuery) {
  const scope = await getClientScope();
  const where: Prisma.ClientWhereInput = {
    archivedAt: null,
    ...clientRowFilter(scope),
    status: q.status,
    ...(q.q
      ? {
          OR: [
            { displayName: { contains: q.q, mode: "insensitive" } },
            { legalName: { contains: q.q, mode: "insensitive" } },
            { code: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(q.owner ? { assignments: { some: { userId: q.owner, role: "OWNER", ...activeOn() } } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.client.findMany({
      where,
      orderBy: { displayName: "asc" },
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        code: true,
        displayName: true,
        legalName: true,
        status: true,
        health: true,
        assignments: { where: { role: "OWNER", ...activeOn() }, select: { user: { select: { id: true, name: true } } }, take: 1 },
        _count: { select: { allocations: { where: activeOn() }, cases: { where: { stage: { not: "CLOSED" } } } } },
      },
    }),
    db.client.count({ where }),
  ]);
  return { rows, total, page: q.page };
}

export async function getClient(id: string) {
  await assertClientAccess(id);
  const client = await db.client.findFirst({
    where: { id, archivedAt: null },
    include: {
      contacts: { orderBy: { name: "asc" } },
      contracts: { orderBy: { startDate: "desc" }, include: { rateCards: { orderBy: { effectiveFrom: "desc" } } } },
      assignments: { orderBy: [{ effectiveTo: { sort: "asc", nulls: "first" } }, { effectiveFrom: "desc" }], include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!client) throw notFound();
  return client;
}

export async function createClient(actor: Actor, input: ClientInput) {
  return db.$transaction(async (tx) => {
    const code = `CL-${pad(await nextNumber(tx, "CL"))}`;
    const client = await tx.client.create({ data: { ...input, code, createdById: actor.id } });
    // Someone without "see all clients" must keep access to what they just created.
    if (!can(actor, "client:read_all")) {
      await tx.accountAssignment.create({ data: { clientId: client.id, userId: actor.id, role: "OWNER", effectiveFrom: todayDate() } });
    }
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: client.id, action: "create", after: { name: input.displayName, code } });
    return { id: client.id };
  });
}

export async function updateClient(actor: Actor, id: string, input: ClientInput) {
  await assertClientAccess(id);
  const before = await db.client.findUnique({ where: { id } });
  if (!before) throw notFound();
  return db.$transaction(async (tx) => {
    const after = await tx.client.update({ where: { id }, data: input });
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: id, action: "update", before, after });
    return { id };
  });
}

export async function changeClientStatus(actor: Actor, id: string, status: ClientStatus) {
  await assertClientAccess(id);
  const client = await db.client.findUnique({
    where: { id },
    select: { status: true, assignments: { where: { role: "OWNER", ...activeOn() }, select: { id: true } }, contracts: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!client) throw notFound();
  if (!TRANSITIONS[client.status].includes(status)) throw invalid("errors.badTransition");
  // WF-01: an account can't start operating without an owner and a contract.
  if (status === "ACTIVE" && client.assignments.length === 0) throw invalid("errors.clientNeedsOwner");
  if (status === "ACTIVE" && client.contracts.length === 0) throw invalid("errors.clientNeedsContract");
  await db.$transaction(async (tx) => {
    await tx.client.update({ where: { id }, data: { status } });
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: id, action: "status_change", before: { status: client.status }, after: { status } });
  });
  return { id };
}

/** ACC-02/05: assigning a new owner closes the previous one, so history stays complete. */
export async function assignUser(actor: Actor, clientId: string, input: { userId: string; role: "OWNER" | "SUPPORT"; effectiveFrom: string }) {
  await assertClientAccess(clientId);
  const from = dateOnly(input.effectiveFrom);
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { name: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw invalid("errors.userNotFound");
  return db.$transaction(async (tx) => {
    if (input.role === "OWNER") {
      const current = await tx.accountAssignment.findFirst({ where: { clientId, role: "OWNER", effectiveTo: null } });
      if (current) {
        if (current.effectiveFrom >= from) throw conflict("errors.ownerOverlap");
        await tx.accountAssignment.update({ where: { id: current.id }, data: { effectiveTo: from } });
      }
    }
    const row = await tx.accountAssignment.create({ data: { clientId, userId: input.userId, role: input.role, effectiveFrom: from } });
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: clientId, action: "assign", after: { name: user.name, role: input.role, from: input.effectiveFrom } });
    return { id: row.id };
  });
}

export async function endAssignment(actor: Actor, clientId: string, assignmentId: string) {
  await assertClientAccess(clientId);
  const row = await db.accountAssignment.findFirst({ where: { id: assignmentId, clientId, effectiveTo: null } });
  if (!row) throw notFound();
  const today = todayDate();
  await db.$transaction(async (tx) => {
    if (row.effectiveFrom >= today) await tx.accountAssignment.delete({ where: { id: row.id } });
    else await tx.accountAssignment.update({ where: { id: row.id }, data: { effectiveTo: today } });
    await writeAudit(tx, { actorId: actor.id, entityType: "client", entityId: clientId, action: "unassign", after: { userId: row.userId, role: row.role } });
  });
  return { id: clientId };
}

export async function addContact(actor: Actor, clientId: string, input: { name: string; role?: string | null; email?: string | null; phone?: string | null; isBillingContact?: boolean | null }) {
  await assertClientAccess(clientId);
  const row = await db.clientContact.create({ data: { clientId, name: input.name, role: input.role, email: input.email, phone: input.phone, isBillingContact: !!input.isBillingContact } });
  await writeAudit(db, { actorId: actor.id, entityType: "client", entityId: clientId, action: "contact_add", after: { name: input.name } });
  return { id: row.id };
}

export async function removeContact(actor: Actor, clientId: string, contactId: string) {
  await assertClientAccess(clientId);
  const { count } = await db.clientContact.deleteMany({ where: { id: contactId, clientId } });
  if (!count) throw notFound();
  await writeAudit(db, { actorId: actor.id, entityType: "client", entityId: clientId, action: "contact_remove", after: { contactId } });
  return { id: clientId };
}

const pricing = (i: { feePercent?: string | null; feePerHead?: string | null; feeFixedMonthly?: string | null; sponsorshipRenewalFee?: string | null }) => ({
  feePercent: percentToFraction(i.feePercent),
  feePerHead: i.feePerHead ?? null,
  feeFixedMonthly: i.feeFixedMonthly ?? null,
  sponsorshipRenewalFee: i.sponsorshipRenewalFee ?? null,
});

/** A billing model is useless without the fee it needs, and a bad contract corrupts every invoice after it. */
function assertPricing(model: string, i: { feePercent?: string | null; feePerHead?: string | null; feeFixedMonthly?: string | null }) {
  if (model === "COST_PLUS_PERCENT" && !i.feePercent) throw invalid("errors.validation", [{ path: "feePercent", message: "validation.required" }]);
  if (model === "FIXED_PER_HEAD" && !i.feePerHead) throw invalid("errors.validation", [{ path: "feePerHead", message: "validation.required" }]);
  if (model === "COST_PLUS_FIXED" && !i.feeFixedMonthly) throw invalid("errors.validation", [{ path: "feeFixedMonthly", message: "validation.required" }]);
}

export async function createContract(actor: Actor, clientId: string, input: ContractInput) {
  await assertClientAccess(clientId);
  assertPricing(input.billingModel, input);
  const start = dateOnly(input.startDate);
  const end = dateOrNull(input.endDate);
  if (end && end <= start) throw invalid("errors.validation", [{ path: "endDate", message: "validation.endAfterStart" }]);
  return db.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        clientId,
        number: input.number,
        startDate: start,
        endDate: end,
        status: "ACTIVE",
        billingModel: input.billingModel,
        paymentTermsDays: input.paymentTermsDays,
        renewalNoticeDays: input.renewalNoticeDays,
        vatRate: percentToFraction(input.vatPercent) ?? "0.15",
        rateCards: { create: { effectiveFrom: start, ...pricing(input) } },
      },
    });
    await writeAudit(tx, { actorId: actor.id, entityType: "contract", entityId: contract.id, action: "create", after: { name: input.number, clientId } });
    return { id: contract.id };
  });
}

/** New prices are a new effective-dated row, so past invoices can always be explained. */
export async function addRateCard(actor: Actor, contractId: string, input: RateCardInput) {
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { clientId: true, billingModel: true } });
  if (!contract) throw notFound();
  await assertClientAccess(contract.clientId);
  assertPricing(contract.billingModel, input);
  const from = dateOnly(input.effectiveFrom);
  return db.$transaction(async (tx) => {
    const current = await tx.rateCard.findFirst({ where: { contractId, effectiveTo: null } });
    if (current) {
      if (current.effectiveFrom >= from) throw invalid("errors.validation", [{ path: "effectiveFrom", message: "validation.afterCurrentRate" }]);
      await tx.rateCard.update({ where: { id: current.id }, data: { effectiveTo: from } });
    }
    const row = await tx.rateCard.create({ data: { contractId, effectiveFrom: from, ...pricing(input) } });
    await writeAudit(tx, { actorId: actor.id, entityType: "contract", entityId: contractId, action: "rate_change", after: { from: input.effectiveFrom, ...pricing(input) } });
    return { id: row.id };
  });
}

export async function changeContractStatus(actor: Actor, contractId: string, status: "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED") {
  const contract = await db.contract.findUnique({ where: { id: contractId }, select: { clientId: true, status: true } });
  if (!contract) throw notFound();
  await assertClientAccess(contract.clientId);
  await db.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contractId }, data: { status } });
    await writeAudit(tx, { actorId: actor.id, entityType: "contract", entityId: contractId, action: "status_change", before: { status: contract.status }, after: { status } });
  });
  return { id: contractId };
}

export async function activeUserOptions() {
  const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return users.map((u) => ({ value: u.id, label: u.name }));
}

export async function clientOptions() {
  const scope = await getClientScope();
  const rows = await db.client.findMany({ where: { archivedAt: null, ...clientRowFilter(scope) }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
  return rows.map((c) => ({ value: c.id, label: c.displayName }));
}
