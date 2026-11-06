import { apiRoute } from "@/server/api/route";
import { stageSchema } from "@/server/modules/operations/schema";
import { moveCase } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "case:update",
  body: stageSchema,
  handler: ({ actor, body, params }) => moveCase(actor, String(params.id), body.stage, body.note),
});
