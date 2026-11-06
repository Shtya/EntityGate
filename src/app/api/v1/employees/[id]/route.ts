import { apiRoute } from "@/server/api/route";
import { employeeUpdateSchema } from "@/server/modules/employees/schema";
import { getEmployee, updateEmployee } from "@/server/modules/employees/service";

export const GET = apiRoute({
  permission: "employee:read",
  handler: ({ actor, params }) => getEmployee(actor, String(params.id)),
});

export const PUT = apiRoute({
  permission: "employee:update",
  body: employeeUpdateSchema,
  handler: ({ actor, body, params }) => updateEmployee(actor, String(params.id), body),
});
