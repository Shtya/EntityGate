import { apiRoute } from "@/server/api/route";
import { contractStatusSchema } from "@/server/modules/clients/schema";
import { changeContractStatus } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "contract:manage",
  body: contractStatusSchema,
  handler: ({ actor, body, params }) => changeContractStatus(actor, String(params.id), body.status),
});
