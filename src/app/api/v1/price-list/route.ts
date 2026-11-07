import { apiRoute } from "@/server/api/route";
import { createService, listServices, listServicesQuery, serviceSchema } from "@/server/modules/price-list/service";

export const GET = apiRoute({
  permission: "invoice:read",
  query: listServicesQuery,
  handler: ({ query }) => listServices(query),
});

export const POST = apiRoute({
  permission: "price_list:manage",
  body: serviceSchema,
  status: 201,
  handler: ({ actor, body }) => createService(actor, body),
});
