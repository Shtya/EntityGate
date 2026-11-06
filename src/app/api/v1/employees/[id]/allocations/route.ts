import { apiRoute } from "@/server/api/route";
import { allocationSchema } from "@/server/modules/employees/schema";
import { allocate } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "allocation:manage",
  body: allocationSchema,
  status: 201,
  handler: ({ actor, body, params }) => allocate(actor, String(params.id), body),
});
