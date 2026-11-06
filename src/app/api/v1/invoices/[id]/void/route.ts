import { apiRoute } from "@/server/api/route";
import { voidInvoice } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:void",
  handler: ({ actor, params }) => voidInvoice(actor, String(params.id)),
});
