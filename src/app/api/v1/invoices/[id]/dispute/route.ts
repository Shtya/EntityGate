import { apiRoute } from "@/server/api/route";
import { disputeSchema } from "@/server/modules/billing/schema";
import { setDisputed } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:approve",
  body: disputeSchema,
  handler: ({ actor, body, params }) => setDisputed(actor, String(params.id), body.disputed),
});
