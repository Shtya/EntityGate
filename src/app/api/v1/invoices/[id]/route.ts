import { apiRoute } from "@/server/api/route";
import { getInvoice } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "invoice:read",
  handler: ({ params }) => getInvoice(String(params.id)),
});
