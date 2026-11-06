import { apiRoute } from "@/server/api/route";
import { commentSchema } from "@/server/modules/operations/schema";
import { commentOnCase } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "case:update",
  body: commentSchema,
  status: 201,
  handler: ({ actor, body, params }) => commentOnCase(actor, String(params.id), body),
});
