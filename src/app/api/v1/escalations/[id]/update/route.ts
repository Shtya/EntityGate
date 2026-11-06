import { apiRoute } from "@/server/api/route";
import { escalationUpdateSchema } from "@/server/modules/operations/schema";
import { updateEscalation } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "escalation:manage",
  body: escalationUpdateSchema,
  handler: ({ actor, body, params }) => updateEscalation(actor, String(params.id), body.note),
});
