import { apiRoute } from "@/server/api/route";
import { deleteHoliday } from "@/server/modules/master-data/service";

export const DELETE = apiRoute({
  permission: "master_data:manage",
  handler: ({ actor, params }) => deleteHoliday(actor, String(params.id)),
});
