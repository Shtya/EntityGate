import { apiRoute } from "@/server/api/route";
import { clientServiceRules, serviceRulesSchema, setClientServiceRules } from "@/server/modules/billing/breakdown";

export const GET = apiRoute({
  permission: "contract:read",
  handler: ({ params }) => clientServiceRules(String(params.id)),
});

export const PUT = apiRoute({
  permission: "contract:manage",
  body: serviceRulesSchema,
  handler: ({ actor, body, params }) => setClientServiceRules(actor, String(params.id), body),
});
