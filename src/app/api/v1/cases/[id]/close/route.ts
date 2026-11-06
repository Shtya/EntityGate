import { apiRoute } from "@/server/api/route";
import { closeCaseSchema } from "@/server/modules/operations/schema";
import { closeCase } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "case:close",
  body: closeCaseSchema,
  handler: ({ actor, body, params }) => closeCase(actor, String(params.id), body),
});
