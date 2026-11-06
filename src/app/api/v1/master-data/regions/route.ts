import { apiRoute } from "@/server/api/route";
import { createRegion, regionSchema } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: regionSchema,
  status: 201,
  handler: ({ actor, body }) => createRegion(actor, body),
});
