import { apiRoute } from "@/server/api/route";
import { compensationSchema } from "@/server/modules/employees/schema";
import { addCompensation } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "compensation:manage",
  body: compensationSchema,
  status: 201,
  handler: ({ actor, body, params }) => addCompensation(actor, String(params.id), body),
});
