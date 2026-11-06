import { apiRoute } from "@/server/api/route";
import { invalid } from "@/server/errors";
import { importPayroll } from "@/server/modules/finance/service";
import { isPeriod } from "@/lib/dates";

export const POST = apiRoute({
  permission: "payroll:manage",
  status: 201,
  handler: async ({ actor, req }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const period = form?.get("period");
    if (!(file instanceof File)) throw invalid("errors.fileField");
    if (typeof period !== "string" || !isPeriod(period)) throw invalid("errors.validation", [{ path: "period", message: "validation.period" }]);
    return importPayroll(actor, period, file);
  },
});
