import { apiRoute } from "@/server/api/route";
import { caseSchema, listCasesQuery } from "@/server/modules/operations/schema";
import { createCase, listCases } from "@/server/modules/operations/service";

export const GET = apiRoute({
  permission: "case:read",
  query: listCasesQuery,
  handler: ({ actor, query }) => listCases(actor, query),
});

export const POST = apiRoute({
  permission: "case:create",
  body: caseSchema,
  status: 201,
  handler: ({ actor, body }) => createCase(actor, body),
});
