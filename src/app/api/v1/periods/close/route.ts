import { apiRoute } from "@/server/api/route";
import { periodBody } from "@/server/modules/finance/schema";
import { closePeriod } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "period:close",
  body: periodBody,
  handler: ({ actor, body }) => closePeriod(actor, body.period),
});
