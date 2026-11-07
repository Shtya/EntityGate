import { apiRoute } from "@/server/api/route";
import { categorySchema, createCategory, listCategories } from "@/server/modules/operations/categories";

export const GET = apiRoute({
  permission: "task:read",
  handler: () => listCategories(),
});

export const POST = apiRoute({
  permission: "task_category:manage",
  body: categorySchema,
  status: 201,
  handler: ({ actor, body }) => createCategory(actor, body),
});
