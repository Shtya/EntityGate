import { apiRoute } from "@/server/api/route";
import { removeLine } from "@/server/modules/billing/service";

export const DELETE = apiRoute({
  permission: "invoice:create",
  handler: ({ actor, params }) => removeLine(actor, String(params.id), String(params.lineId)),
});
