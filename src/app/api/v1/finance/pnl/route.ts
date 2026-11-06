import { apiRoute } from "@/server/api/route";
import { periodOf, todayDate } from "@/lib/dates";
import { pnlQuery } from "@/server/modules/finance/schema";
import { pnl } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "finance:read",
  query: pnlQuery,
  handler: ({ query }) => { const now = periodOf(todayDate()); return pnl(query.from ?? query.to ?? now, query.to ?? now); },
});
