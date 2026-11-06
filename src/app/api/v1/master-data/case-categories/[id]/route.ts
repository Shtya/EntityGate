import { apiRoute } from "@/server/api/route";
import { caseCategorySchema, updateCaseCategory } from "@/server/modules/master-data/service";

export const PUT = apiRoute({
  permission: "master_data:manage",
  body: caseCategorySchema,
  handler: ({ actor, body, params }) => updateCaseCategory(actor, String(params.id), body),
});
