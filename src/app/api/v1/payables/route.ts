import { apiRoute } from "@/server/api/route";
import { listPayablesQuery, payableSchema } from "@/server/modules/finance/schema";
import { createPayable, listPayables } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "payable:read",
  query: listPayablesQuery,
  handler: ({ query }) => listPayables(query),
});

export const POST = apiRoute({
  permission: "payable:manage",
  body: payableSchema,
  status: 201,
  handler: ({ actor, body }) => createPayable(actor, body),
});
