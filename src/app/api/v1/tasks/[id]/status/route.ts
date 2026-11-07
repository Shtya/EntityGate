import { apiRoute } from "@/server/api/route";
import { taskStatusSchema } from "@/server/modules/operations/schema";
import { setTaskStatus } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "task:update",
  body: taskStatusSchema,
  handler: ({ actor, body, params }) => setTaskStatus(actor, String(params.id), body.status, body.reason),
});
