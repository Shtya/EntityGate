import { apiRoute } from "@/server/api/route";
import { caseCategorySchema, createCaseCategory } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: caseCategorySchema,
  status: 201,
  handler: ({ actor, body }) => createCaseCategory(actor, body),
});
