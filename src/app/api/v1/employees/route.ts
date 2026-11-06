import { apiRoute } from "@/server/api/route";
import { employeeCreateSchema, listEmployeesQuery } from "@/server/modules/employees/schema";
import { createEmployee, listEmployees } from "@/server/modules/employees/service";

export const GET = apiRoute({
  permission: "employee:read",
  query: listEmployeesQuery,
  handler: ({ query }) => listEmployees(query),
});

export const POST = apiRoute({
  permission: "employee:create",
  body: employeeCreateSchema,
  status: 201,
  handler: ({ actor, body }) => createEmployee(actor, body),
});
