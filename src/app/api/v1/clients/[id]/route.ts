import { apiRoute } from "@/server/api/route";
import { clientSchema } from "@/server/modules/clients/schema";
import { getClient, updateClient } from "@/server/modules/clients/service";

export const GET = apiRoute({
  permission: "client:read",
  handler: ({ params }) => getClient(String(params.id)),
});

export const PUT = apiRoute({
  permission: "client:update",
  body: clientSchema,
  handler: ({ actor, body, params }) => updateClient(actor, String(params.id), body),
});
