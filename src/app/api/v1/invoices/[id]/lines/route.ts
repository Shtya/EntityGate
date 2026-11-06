import { apiRoute } from "@/server/api/route";
import { lineSchema } from "@/server/modules/billing/schema";
import { addLine } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "invoice:create",
  body: lineSchema,
  status: 201,
  handler: ({ actor, body, params }) => addLine(actor, String(params.id), body),
});
