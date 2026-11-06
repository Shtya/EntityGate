import { apiRoute } from "@/server/api/route";
import { dashboardData, dashboardQuery } from "@/server/modules/reports/dashboard";

export const GET = apiRoute({
  permission: "overview:read",
  query: dashboardQuery,
  handler: ({ actor, query }) => dashboardData(actor, query),
});
