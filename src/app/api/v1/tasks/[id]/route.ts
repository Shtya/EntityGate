import { apiRoute } from "@/server/api/route";
import { getTask, updateTask } from "@/server/modules/operations/service";
import { taskSchema } from "@/server/modules/operations/schema";

export const GET = apiRoute({
  permission: "task:read",
  handler: ({ actor, params }) => getTask(actor, String(params.id)),
});

export const PUT = apiRoute({
  permission: "task:update",
  body: taskSchema,
  handler: ({ actor, body, params }) => updateTask(actor, String(params.id), body),
});
