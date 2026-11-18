import { apiRoute } from "@/server/api/route";
import { breakdownWorkbook } from "@/server/modules/billing/breakdown-export";

/** The invoice as the client's per-employee breakdown workbook. */
export const GET = apiRoute({
  permission: "invoice:read",
  handler: async ({ actor, params }) => {
    const { buffer, filename } = await breakdownWorkbook(actor, String(params.id));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
});
