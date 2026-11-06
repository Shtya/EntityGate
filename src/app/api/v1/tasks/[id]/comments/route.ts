import { apiRoute } from "@/server/api/route";
import { commentSchema } from "@/server/modules/operations/schema";
import { commentOnTask } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "task:update",
  body: commentSchema,
  status: 201,
  handler: ({ actor, body, params }) => commentOnTask(actor, String(params.id), body),
});
