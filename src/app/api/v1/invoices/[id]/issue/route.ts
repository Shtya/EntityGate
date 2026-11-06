import { apiRoute } from "@/server/api/route";
import { issueInvoice } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:issue",
  handler: ({ actor, params }) => issueInvoice(actor, String(params.id)),
});
