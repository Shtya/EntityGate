import { apiRoute } from "@/server/api/route";
import { clientSchema, listClientsQuery } from "@/server/modules/clients/schema";
import { createClient, listClients } from "@/server/modules/clients/service";

export const GET = apiRoute({
  permission: "client:read",
  query: listClientsQuery,
  handler: ({ query }) => listClients(query),
});

export const POST = apiRoute({
  permission: "client:create",
  body: clientSchema,
  status: 201,
  handler: ({ actor, body }) => createClient(actor, body),
});
