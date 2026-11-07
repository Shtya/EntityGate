import { apiRoute } from "@/server/api/route";
import { restoreCategory } from "@/server/modules/operations/categories";

export const POST = apiRoute({
  permission: "task_category:manage",
  handler: ({ actor, params }) => restoreCategory(actor, String(params.id)),
});
