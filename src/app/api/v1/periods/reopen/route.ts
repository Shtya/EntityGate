import { apiRoute } from "@/server/api/route";
import { periodBody } from "@/server/modules/finance/schema";
import { reopenPeriod } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "period:close",
  body: periodBody,
  handler: ({ actor, body }) => reopenPeriod(actor, body.period),
});
