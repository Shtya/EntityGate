import { apiRoute } from "@/server/api/route";
import { clearTaskFinance } from "@/server/modules/operations/service";

export const POST = apiRoute({
  permission: "payment:record",
  handler: ({ actor, params }) => clearTaskFinance(actor, String(params.id)),
});
