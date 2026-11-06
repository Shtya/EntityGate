import { apiRoute } from "@/server/api/route";
import { commitEmployeeImport } from "@/server/modules/imports/service";

export const POST = apiRoute({
  permission: "employee:import",
  handler: ({ actor, params }) => commitEmployeeImport(actor, String(params.id)),
});
