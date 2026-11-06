import { apiRoute } from "@/server/api/route";
import { decisionSchema } from "@/server/modules/finance/schema";
import { decideExpense } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "expense:approve",
  body: decisionSchema,
  handler: ({ actor, body, params }) => decideExpense(actor, String(params.id), body.approved),
});
