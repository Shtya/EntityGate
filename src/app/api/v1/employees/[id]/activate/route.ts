import { apiRoute } from "@/server/api/route";
import { activateEmployee } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "employee:update",
  handler: ({ actor, params }) => activateEmployee(actor, String(params.id)),
});
