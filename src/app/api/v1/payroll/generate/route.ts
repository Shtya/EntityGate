import { apiRoute } from "@/server/api/route";
import { periodBody } from "@/server/modules/finance/schema";
import { generatePayroll } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "payroll:manage",
  body: periodBody,
  status: 201,
  handler: ({ actor, body }) => generatePayroll(actor, body.period),
});
