import { apiRoute } from "@/server/api/route";
import { approveRun } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:approve",
  handler: ({ actor, params }) => approveRun(actor, String(params.id)),
});
