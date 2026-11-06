import { apiRoute } from "@/server/api/route";
import { poSchema } from "@/server/modules/billing/schema";
import { updateInvoiceMeta } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:create",
  body: poSchema,
  handler: ({ actor, body, params }) => updateInvoiceMeta(actor, String(params.id), body),
});
