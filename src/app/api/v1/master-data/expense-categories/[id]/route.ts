import { apiRoute } from "@/server/api/route";
import { expenseCategorySchema, updateExpenseCategory } from "@/server/modules/master-data/service";

export const PUT = apiRoute({
  permission: "master_data:manage",
  body: expenseCategorySchema,
  handler: ({ actor, body, params }) => updateExpenseCategory(actor, String(params.id), body),
});
