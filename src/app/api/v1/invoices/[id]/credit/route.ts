import { apiRoute } from "@/server/api/route";
import { creditSchema } from "@/server/modules/billing/schema";
import { creditInvoice } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:void",
  body: creditSchema,
  status: 201,
  handler: ({ actor, body, params }) => creditInvoice(actor, String(params.id), body),
});
