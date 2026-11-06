import { apiRoute } from "@/server/api/route";
import { reassignSchema } from "@/server/modules/operations/schema";
import { reassignTask } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "task:update",
  body: reassignSchema,
  handler: ({ actor, body, params }) => reassignTask(actor, String(params.id), body.ownerId),
});
