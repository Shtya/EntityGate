import { apiRoute } from "@/server/api/route";
import { employeeTemplate } from "@/server/modules/imports/service";

export const GET = apiRoute({
  permission: "employee:import",
  handler: async () =>
    new Response(new Uint8Array(await employeeTemplate()), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="employees-template.xlsx"',
      },
    }),
});
