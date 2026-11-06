import { apiRoute } from "@/server/api/route";
import { expenseSchema, listExpensesQuery } from "@/server/modules/finance/schema";
import { createExpense, listExpenses } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "expense:read",
  query: listExpensesQuery,
  handler: ({ query }) => listExpenses(query),
});

export const POST = apiRoute({
  permission: "expense:create",
  body: expenseSchema,
  status: 201,
  handler: ({ actor, body }) => createExpense(actor, body),
});
