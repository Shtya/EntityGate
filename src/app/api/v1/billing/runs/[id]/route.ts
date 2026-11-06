import { apiRoute } from "@/server/api/route";
import { getRun } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "billing_run:manage",
  handler: ({ params }) => getRun(String(params.id)),
});
