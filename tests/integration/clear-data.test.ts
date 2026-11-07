/**
 * The real wipe, inside a transaction that always rolls back, so nothing is lost by running it.
 * TRUNCATE also proves the table list is complete: Postgres rejects it if a table outside the
 * list still references one inside it.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { wipeBusinessData } from "@/server/modules/system/service";

vi.setConfig({ testTimeout: 120_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());
const ROLLBACK = "rollback";

describe.skipIf(!process.env.DATABASE_URL)("clearing demo data", () => {
  it("leaves one account and the setup, and removes every business record", async () => {
    const keep = await db.user.findFirstOrThrow({ where: { userRoles: { some: { role: { key: "ADMIN" } } } } });
    const before = await db.client.count();
    await expect(
      db.$transaction(
        async (tx) => {
          await wipeBusinessData(tx as never, keep.id);
          expect(await tx.user.findMany({ select: { id: true } })).toEqual([{ id: keep.id }]);
          // The account still works: credentials and roles survive with it.
          expect(await tx.userRole.count({ where: { userId: keep.id } })).toBeGreaterThan(0);
          for (const n of await Promise.all([tx.client.count(), tx.employee.count(), tx.invoice.count(), tx.payment.count(), tx.expense.count(), tx.case.count(), tx.task.count(), tx.auditEvent.count(), tx.numberSequence.count(), tx.attachment.count()])) expect(n).toBe(0);
          // Setup stays.
          for (const n of await Promise.all([tx.role.count(), tx.permission.count(), tx.region.count(), tx.caseCategory.count(), tx.expenseCategory.count(), tx.reminderRule.count()])) expect(n).toBeGreaterThan(0);
          throw new Error(ROLLBACK);
        },
        { timeout: 110_000, maxWait: 15_000 },
      ),
    ).rejects.toThrow(ROLLBACK);
    expect(await db.client.count()).toBe(before);
  });
});
