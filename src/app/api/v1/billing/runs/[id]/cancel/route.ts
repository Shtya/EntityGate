import { apiRoute } from "@/server/api/route";
import { cancelRun } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "billing_run:manage",
  handler: ({ actor, params }) => cancelRun(actor, String(params.id)),
});
