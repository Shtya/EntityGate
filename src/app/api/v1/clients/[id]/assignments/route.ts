import { apiRoute } from "@/server/api/route";
import { assignSchema } from "@/server/modules/clients/schema";
import { assignUser } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "client:assign",
  body: assignSchema,
  status: 201,
  handler: ({ actor, body, params }) => assignUser(actor, String(params.id), body),
});
