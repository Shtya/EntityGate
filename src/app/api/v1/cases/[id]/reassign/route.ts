import { apiRoute } from "@/server/api/route";
import { reassignSchema } from "@/server/modules/operations/schema";
import { reassignCase } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "case:update",
  body: reassignSchema,
  handler: ({ actor, body, params }) => reassignCase(actor, String(params.id), body.ownerId),
});
