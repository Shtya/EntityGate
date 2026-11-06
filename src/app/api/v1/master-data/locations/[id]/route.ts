import { apiRoute } from "@/server/api/route";
import { archiveLocation } from "@/server/modules/master-data/service";

export const DELETE = apiRoute({
  permission: "master_data:manage",
  handler: ({ actor, params }) => archiveLocation(actor, String(params.id)),
});
