import { apiRoute } from "@/server/api/route";
import { payrollTemplate } from "@/server/modules/finance/service";

export const GET = apiRoute({
  permission: "payroll:read",
  handler: async () =>
    new Response(new Uint8Array(await payrollTemplate()), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="payroll-template.xlsx"' },
    }),
});
