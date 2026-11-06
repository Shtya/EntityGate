import { apiRoute } from "@/server/api/route";
import { listPayrollRuns } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "payroll:read",
  handler: () => listPayrollRuns(),
});
