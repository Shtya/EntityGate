import { apiRoute } from "@/server/api/route";
import { clientStatusSchema } from "@/server/modules/clients/schema";
import { changeClientStatus } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "client:archive",
  body: clientStatusSchema,
  handler: ({ actor, body, params }) => changeClientStatus(actor, String(params.id), body.status),
});
