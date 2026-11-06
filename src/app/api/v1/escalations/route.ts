import { apiRoute } from "@/server/api/route";
import { escalationSchema, listEscalationsQuery } from "@/server/modules/operations/schema";
import { listEscalations, raiseEscalation } from "@/server/modules/operations/service";

export const GET = apiRoute({
  permission: "escalation:read",
  query: listEscalationsQuery,
  handler: ({ actor, query }) => listEscalations(query.status, actor),
});

export const POST = apiRoute({
  permission: "escalation:raise",
  body: escalationSchema,
  status: 201,
  handler: ({ actor, body }) => raiseEscalation(actor, body),
});
