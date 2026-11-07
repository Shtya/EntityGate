/**
 * Removes what the live test suite leaves behind in a development database: records named "E2E ..."
 * and anything dated in the far-future test years. Audit events stay, because they're append-only.
 *
 *   npm run db:clean-tests
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("Not for production.");
const db = new PrismaClient();
const FAR_FUTURE = "2100-01";

async function main() {
  const clients = (await db.client.findMany({ where: { displayName: { startsWith: "E2E " } }, select: { id: true } })).map((c) => c.id);
  // A formula-named client from the export test.
  const odd = (await db.client.findMany({ where: { displayName: { startsWith: "=SUM(" } }, select: { id: true } })).map((c) => c.id);
  const clientIds = [...clients, ...odd];
  const employeeIds = (await db.employee.findMany({ where: { OR: [{ nameEn: { startsWith: "E2E " } }, { allocations: { some: { clientId: { in: clientIds } } } }] }, select: { id: true } })).map((e) => e.id);

  await db.$transaction(
    async (tx) => {
      const byClient = { clientId: { in: clientIds } };
      const invoices = { OR: [byClient, { billingRun: { period: { gte: FAR_FUTURE } } }, { periodStart: { gte: new Date("2100-01-01") } }] };
      const invoiceIds = (await tx.invoice.findMany({ where: invoices, select: { id: true } })).map((i) => i.id);
      await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.expense.updateMany({ where: { billedLine: { invoiceId: { in: invoiceIds } } }, data: { billedLineId: null } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.updateMany({ where: { creditForId: { in: invoiceIds } }, data: { creditForId: null } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      await tx.billingRun.deleteMany({ where: { period: { gte: FAR_FUTURE } } });
      await tx.payment.deleteMany({ where: byClient });
      await tx.payrollRun.deleteMany({ where: { period: { gte: FAR_FUTURE } } });
      await tx.accountingPeriod.deleteMany({ where: { period: { gte: FAR_FUTURE } } });
      await tx.payrollItem.deleteMany({ where: { OR: [byClient, { employeeId: { in: employeeIds } }] } });
      await tx.expense.deleteMany({ where: { OR: [byClient, { employeeId: { in: employeeIds } }, { incurredAt: { gte: new Date("2100-01-01") } }] } });

      const caseWhere = { OR: [byClient, { employeeId: { in: employeeIds } }, { title: { startsWith: "E2E " } }] };
      const caseIds = (await tx.case.findMany({ where: caseWhere, select: { id: true } })).map((c) => c.id);
      await tx.escalation.deleteMany({ where: { OR: [byClient, { caseId: { in: caseIds } }, { title: { startsWith: "E2E " } }] } });
      const taskWhere = { OR: [byClient, { employeeId: { in: employeeIds } }, { caseId: { in: caseIds } }, { title: { startsWith: "E2E " } }] };
      const taskIds = (await tx.task.findMany({ where: taskWhere, select: { id: true } })).map((t) => t.id);
      await tx.taskComment.deleteMany({ where: { taskId: { in: taskIds } } });
      await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      await tx.caseComment.deleteMany({ where: { caseId: { in: caseIds } } });
      await tx.case.deleteMany({ where: { id: { in: caseIds } } });

      await tx.document.deleteMany({ where: { OR: [{ ownerId: { in: employeeIds } }, { ownerId: { in: clientIds } }] } });
      await tx.compensation.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await tx.allocation.deleteMany({ where: { OR: [byClient, { employeeId: { in: employeeIds } }] } });
      await tx.lifecycleWorkflow.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await tx.employee.deleteMany({ where: { id: { in: employeeIds } } });

      await tx.accountAssignment.deleteMany({ where: byClient });
      await tx.rateCard.deleteMany({ where: { contract: byClient } });
      await tx.contract.deleteMany({ where: byClient });
      await tx.client.deleteMany({ where: { id: { in: clientIds } } });
      await tx.payable.deleteMany({ where: { description: { startsWith: "E2E " } } });
      await tx.sponsor.deleteMany({ where: { name: { startsWith: "E2E " } } });
      await tx.expenseCategory.deleteMany({ where: { code: { startsWith: "E2E_" }, expenses: { none: {} } } });
      await tx.notification.deleteMany({ where: { OR: [{ title: { startsWith: "E2E " } }, { body: null }, { body: "{}" }, { body: { contains: "E2E " } }] } });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
  console.log(`Removed ${clientIds.length} test clients and ${employeeIds.length} test employees.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
