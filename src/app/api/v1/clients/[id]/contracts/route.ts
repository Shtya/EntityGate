import { apiRoute } from "@/server/api/route";
import { contractSchema } from "@/server/modules/clients/schema";
import { createContract } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "contract:manage",
  body: contractSchema,
  status: 201,
  handler: ({ actor, body, params }) => createContract(actor, String(params.id), body),
});
