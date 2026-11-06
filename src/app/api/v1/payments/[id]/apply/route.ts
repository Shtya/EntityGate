import { apiRoute } from "@/server/api/route";
import { applyOnAccount } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "payment:record",
  handler: ({ actor, params }) => applyOnAccount(actor, String(params.id)),
});
