import { apiRoute } from "@/server/api/route";
import { runSchema } from "@/server/modules/billing/schema";
import { createBillingRun, listRuns } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "billing_run:manage",
  handler: () => listRuns(),
});

export const POST = apiRoute({
  permission: "billing_run:manage",
  body: runSchema,
  status: 201,
  handler: ({ actor, body }) => createBillingRun(actor, body.period),
});
