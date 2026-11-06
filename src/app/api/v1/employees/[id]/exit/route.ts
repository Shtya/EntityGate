import { apiRoute } from "@/server/api/route";
import { startExit } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "employee:update",
  handler: ({ actor, params }) => startExit(actor, String(params.id)),
});
