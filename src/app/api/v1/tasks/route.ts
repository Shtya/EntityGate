import { apiRoute } from "@/server/api/route";
import { listTasksQuery, taskSchema } from "@/server/modules/operations/schema";
import { createTask, listTasks } from "@/server/modules/operations/service";

export const GET = apiRoute({
  permission: "task:read",
  query: listTasksQuery,
  handler: ({ actor, query }) => listTasks(actor, query),
});

export const POST = apiRoute({
  permission: "task:create",
  body: taskSchema,
  status: 201,
  handler: ({ actor, body }) => createTask(actor, body),
});
