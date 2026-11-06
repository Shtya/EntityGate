import { apiRoute } from "@/server/api/route";
import { payrollItemsQuery } from "@/server/modules/finance/schema";
import { getPayrollRun } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "payroll:read",
  query: payrollItemsQuery,
  handler: ({ params, query }) => getPayrollRun(String(params.id), query),
});
