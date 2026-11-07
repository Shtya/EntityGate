import { apiRoute } from "@/server/api/route";
import { getService, serviceSchema, updateService } from "@/server/modules/price-list/service";

export const GET = apiRoute({
  permission: "invoice:read",
  handler: ({ params }) => getService(String(params.id)),
});

export const PUT = apiRoute({
  permission: "price_list:manage",
  body: serviceSchema,
  handler: ({ actor, body, params }) => updateService(actor, String(params.id), body),
});
