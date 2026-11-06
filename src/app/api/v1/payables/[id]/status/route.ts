import { apiRoute } from "@/server/api/route";
import { payableStatusSchema } from "@/server/modules/finance/schema";
import { setPayableStatus } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "payable:manage",
  body: payableStatusSchema,
  handler: ({ actor, body, params }) => setPayableStatus(actor, String(params.id), body.status, body.reference),
});
