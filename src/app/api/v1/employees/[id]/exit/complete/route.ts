import { apiRoute } from "@/server/api/route";
import { exitSchema } from "@/server/modules/employees/schema";
import { completeExit } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "employee:update",
  body: exitSchema,
  handler: ({ actor, body, params }) => completeExit(actor, String(params.id), body.lastWorkingDay),
});
