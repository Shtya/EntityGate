import { apiRoute } from "@/server/api/route";
import { issueRun } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:issue",
  handler: ({ actor, params }) => issueRun(actor, String(params.id)),
});
