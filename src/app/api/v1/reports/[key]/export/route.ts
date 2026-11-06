import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { apiRoute } from "@/server/api/route";
import { forbidden, notFound } from "@/server/errors";
import { can } from "@/server/rbac/policy";
import { findReport, reportQuery, reportRange } from "@/server/modules/reports/definitions";
import { logExport, toCsv, toXlsx } from "@/server/modules/reports/export";

const query = reportQuery.extend({ format: z.enum(["csv", "xlsx"]).catch("xlsx").default("xlsx") });

export const GET = apiRoute({
  permission: "report:export",
  query,
  handler: async ({ actor, query: q, params }) => {
    const def = findReport(String(params.key));
    if (!def) throw notFound();
    // Exporting a report never reveals more than its own permission allows.
    if (!can(actor, def.permission)) throw forbidden();
    const range = reportRange(q);
    const rows = await def.run(actor, range);
    const t = await getTranslations();
    const locale = await getLocale();
    await logExport(actor, def.key, q.format, { from: range.from, to: range.to, client: range.client }, rows.length);
    const name = `${def.key}-${range.to}.${q.format}`;
    const disposition = `attachment; filename="${name}"`;
    if (q.format === "csv") return new Response(toCsv(def, rows, t), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition } });
    return new Response(new Uint8Array(await toXlsx(def, rows, t, locale === "ar")), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": disposition } });
  },
});
