import { apiRoute } from "@/server/api/route";
import { createExpenseCategory, expenseCategorySchema } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: expenseCategorySchema,
  status: 201,
  handler: ({ actor, body }) => createExpenseCategory(actor, body),
});
