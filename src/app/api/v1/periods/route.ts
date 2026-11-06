import { apiRoute } from "@/server/api/route";
import { listPeriods } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "period:close",
  handler: () => listPeriods(),
});
