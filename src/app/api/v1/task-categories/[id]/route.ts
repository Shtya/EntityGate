import { apiRoute } from "@/server/api/route";
import { categorySchema, removeCategory, renameCategory } from "@/server/modules/operations/categories";

export const PUT = apiRoute({
  permission: "task_category:manage",
  body: categorySchema,
  handler: ({ actor, body, params }) => renameCategory(actor, String(params.id), body),
});

export const DELETE = apiRoute({
  permission: "task_category:manage",
  handler: ({ actor, params }) => removeCategory(actor, String(params.id)),
});
