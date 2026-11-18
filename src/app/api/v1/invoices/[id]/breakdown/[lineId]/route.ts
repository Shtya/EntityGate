import { apiRoute } from "@/server/api/route";
import { breakdownEditSchema, editBreakdown } from "@/server/modules/billing/breakdown";

export const PUT = apiRoute({
  permission: "invoice:create",
  body: breakdownEditSchema,
  handler: ({ actor, body, params }) => editBreakdown(actor, String(params.id), String(params.lineId), body),
});
