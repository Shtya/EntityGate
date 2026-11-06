import { apiRoute } from "@/server/api/route";
import { escalationUpdateSchema } from "@/server/modules/operations/schema";
import { resolveEscalation } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "escalation:manage",
  body: escalationUpdateSchema,
  handler: ({ actor, body, params }) => resolveEscalation(actor, String(params.id), body.note),
});
