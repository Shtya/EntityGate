import { apiRoute } from "@/server/api/route";
import { reopenSchema } from "@/server/modules/operations/schema";
import { reopenCase } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "case:reopen",
  body: reopenSchema,
  handler: ({ actor, body, params }) => reopenCase(actor, String(params.id), body.reason),
});
