/**
 * Database-level guarantees, run against the real Postgres in DATABASE_URL.
 * Every test runs inside a transaction that is always rolled back.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const db = new PrismaClient();
afterAll(() => db.$disconnect());

class Rollback extends Error {}

/** Runs fn in a transaction and rolls it back; returns fn's result or rethrows its error. */
async function inRollback<T>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  let result: T | undefined;
  try {
    await db.$transaction(
      async (tx) => {
        result = await fn(tx);
        throw new Rollback();
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result as T;
}

const D = (s: string) => new Date(`${s}T00:00:00Z`);
const uniq = () => Math.random().toString(36).slice(2, 10);

async function fixtures(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) {
  const client = await tx.client.create({ data: { code: `T-${uniq()}`, legalName: "Test Co", displayName: "Test" } });
  const client2 = await tx.client.create({ data: { code: `T-${uniq()}`, legalName: "Test Co 2", displayName: "Test 2" } });
  const employee = await tx.employee.create({ data: { employeeNo: `E-${uniq()}`, nameEn: "Test Employee", classification: "SPONSORED" } });
  return { client, client2, employee };
}

describe("allocations: no overlapping placements per employee (BR-01)", () => {
  it("rejects an overlapping allocation", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client, client2, employee } = await fixtures(tx);
        await tx.allocation.create({ data: { employeeId: employee.id, clientId: client.id, effectiveFrom: D("2026-01-01"), effectiveTo: null } });
        await tx.allocation.create({ data: { employeeId: employee.id, clientId: client2.id, effectiveFrom: D("2026-06-01") } });
      }),
    ).rejects.toThrow(/allocations_no_overlap|23P01|conflicting key/);
  });

  it("allows back-to-back allocations (effective_to is exclusive)", async () => {
    const count = await inRollback(async (tx) => {
      const { client, client2, employee } = await fixtures(tx);
      await tx.allocation.create({ data: { employeeId: employee.id, clientId: client.id, effectiveFrom: D("2026-01-01"), effectiveTo: D("2026-06-01") } });
      await tx.allocation.create({ data: { employeeId: employee.id, clientId: client2.id, effectiveFrom: D("2026-06-01") } });
      return tx.allocation.count({ where: { employeeId: employee.id } });
    });
    expect(count).toBe(2);
  });

  it("rejects inverted date ranges", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client, employee } = await fixtures(tx);
        await tx.allocation.create({ data: { employeeId: employee.id, clientId: client.id, effectiveFrom: D("2026-06-01"), effectiveTo: D("2026-05-01") } });
      }),
    ).rejects.toThrow(/allocations_valid_range|check constraint/);
  });
});

describe("account ownership: one owner per client at a time (ACC-02)", () => {
  it("rejects a second concurrent OWNER but allows SUPPORT", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        const users = await tx.user.findMany({ take: 3, select: { id: true } });
        await tx.accountAssignment.create({ data: { clientId: client.id, userId: users[0].id, role: "OWNER", effectiveFrom: D("2026-01-01") } });
        await tx.accountAssignment.create({ data: { clientId: client.id, userId: users[1].id, role: "SUPPORT", effectiveFrom: D("2026-01-01") } });
        await tx.accountAssignment.create({ data: { clientId: client.id, userId: users[2].id, role: "OWNER", effectiveFrom: D("2026-03-01") } });
      }),
    ).rejects.toThrow(/account_assignments_single_owner|23P01|conflicting key/);
  });
});

describe("effective-dated cost and pricing can't overlap", () => {
  it("rejects two salaries for the same employee on the same day", async () => {
    await expect(
      inRollback(async (tx) => {
        const { employee } = await fixtures(tx);
        await tx.compensation.create({ data: { employeeId: employee.id, effectiveFrom: D("2026-01-01"), basic: "5000" } });
        await tx.compensation.create({ data: { employeeId: employee.id, effectiveFrom: D("2026-06-01"), basic: "6000" } });
      }),
    ).rejects.toThrow(/compensations_no_overlap|conflicting key/);
  });
  it("rejects two rate cards for the same contract on the same day", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        const contract = await tx.contract.create({ data: { clientId: client.id, number: `C-${uniq()}`, startDate: D("2026-01-01"), billingModel: "COST_PLUS_PERCENT" } });
        await tx.rateCard.create({ data: { contractId: contract.id, effectiveFrom: D("2026-01-01") } });
        await tx.rateCard.create({ data: { contractId: contract.id, effectiveFrom: D("2026-03-01") } });
      }),
    ).rejects.toThrow(/rate_cards_no_overlap|conflicting key/);
  });
});

describe("invoices stay internally consistent", () => {
  it("rejects a total that isn't subtotal + VAT", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        await tx.invoice.create({ data: { clientId: client.id, type: "ONE_OFF", subtotal: "100", vatAmount: "15", total: "120" } });
      }),
    ).rejects.toThrow(/invoices_total_consistent|check constraint/);
  });
  it("accepts a consistent invoice", async () => {
    const total = await inRollback(async (tx) => {
      const { client } = await fixtures(tx);
      const i = await tx.invoice.create({ data: { clientId: client.id, type: "ONE_OFF", subtotal: "100", vatAmount: "15", total: "115" } });
      return i.total.toString();
    });
    expect(total).toBe("115");
  });
  it("rejects a payment allocation larger than the payment or the invoice", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        const inv = await tx.invoice.create({ data: { clientId: client.id, type: "ONE_OFF", subtotal: "1000", vatAmount: "0", vatRate: "0", total: "1000" } });
        const pay = await tx.payment.create({ data: { clientId: client.id, receivedAt: D("2026-09-10"), amount: "500", method: "bank_transfer" } });
        await tx.paymentAllocation.create({ data: { paymentId: pay.id, invoiceId: inv.id, amount: "600" } });
      }),
    ).rejects.toThrow(/exceeds/);
  });
  it("rejects over-collecting an invoice across two payments", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        const inv = await tx.invoice.create({ data: { clientId: client.id, type: "ONE_OFF", subtotal: "1000", vatAmount: "0", vatRate: "0", total: "1000" } });
        for (const amount of ["700", "700"]) {
          const pay = await tx.payment.create({ data: { clientId: client.id, receivedAt: D("2026-09-10"), amount, method: "bank_transfer" } });
          await tx.paymentAllocation.create({ data: { paymentId: pay.id, invoiceId: inv.id, amount } });
        }
      }),
    ).rejects.toThrow(/exceeds/);
  });
  it("allows only one live billing run per period", async () => {
    await expect(
      inRollback(async (tx) => {
        const user = await tx.user.findFirstOrThrow();
        await tx.billingRun.create({ data: { period: "2099-01", createdById: user.id } });
        await tx.billingRun.create({ data: { period: "2099-01", createdById: user.id } });
      }),
    ).rejects.toThrow(/billing_runs_one_live_per_period|Unique constraint/);
  });
});

describe("audit trail is append-only (NFR-06)", () => {
  it("blocks UPDATE", async () => {
    await expect(
      inRollback(async (tx) => {
        const e = await tx.auditEvent.create({ data: { entityType: "test", entityId: "x", action: "create" } });
        await tx.auditEvent.update({ where: { id: e.id }, data: { action: "tampered" } });
      }),
    ).rejects.toThrow(/append-only/);
  });
  it("blocks DELETE", async () => {
    await expect(
      inRollback(async (tx) => {
        const e = await tx.auditEvent.create({ data: { entityType: "test", entityId: "x", action: "create" } });
        await tx.auditEvent.delete({ where: { id: e.id } });
      }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("money columns keep exact decimals", () => {
  it("round-trips NUMERIC(14,2) without float drift", async () => {
    const amount = await inRollback(async (tx) => {
      const { client } = await fixtures(tx);
      const p = await tx.payment.create({ data: { clientId: client.id, receivedAt: D("2026-09-10"), amount: "341386.10", method: "bank_transfer" } });
      return (await tx.payment.findUniqueOrThrow({ where: { id: p.id } })).amount.toString();
    });
    expect(amount).toBe("341386.1");
  });
  it("rejects non-positive payments", async () => {
    await expect(
      inRollback(async (tx) => {
        const { client } = await fixtures(tx);
        await tx.payment.create({ data: { clientId: client.id, receivedAt: D("2026-09-10"), amount: "0", method: "bank_transfer" } });
      }),
    ).rejects.toThrow(/payments_positive|check constraint/);
  });
});
