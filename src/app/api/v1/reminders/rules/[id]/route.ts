import { apiRoute } from "@/server/api/route";
import { ruleSchema, updateRule } from "@/server/modules/notifications/service";

export const PUT = apiRoute({
  permission: "reminder_rule:manage",
  body: ruleSchema,
  handler: ({ actor, body, params }) => updateRule(actor, String(params.id), body),
});
