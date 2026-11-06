import { apiRoute } from "@/server/api/route";
import { decisionSchema } from "@/server/modules/finance/schema";
import { setPayrollConfirmed } from "@/server/modules/finance/service";

export const POST = apiRoute({
  permission: "payroll:manage",
  body: decisionSchema,
  handler: ({ actor, body, params }) => setPayrollConfirmed(actor, String(params.id), body.approved),
});
