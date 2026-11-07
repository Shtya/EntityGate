import { getLocale, getTranslations } from "next-intl/server";
import { apiRoute } from "@/server/api/route";
import { forbidden, notFound } from "@/server/errors";
import { can } from "@/server/rbac/policy";
import { logExport } from "@/server/modules/reports/export";
import { exportList, LIST_EXPORTS } from "@/server/modules/reports/list-exports";
import { todayDate, toDateOnly } from "@/lib/dates";

export const maxDuration = 60;

export const GET = apiRoute({
  permission: "report:export",
  handler: async ({ actor, params, req }) => {
    const key = String(params.list);
    const def = Object.hasOwn(LIST_EXPORTS, key) ? LIST_EXPORTS[key] : undefined;
    if (!def) throw notFound();
    // A file never holds more than the list itself would show this person.
    if (!can(actor, def.permission)) throw forbidden();
    const filters = Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "page"));
    const t = await getTranslations();
    const { buffer, count } = await exportList(def, actor, filters, t, await getLocale());
    await logExport(actor, `list:${key}`, "xlsx", filters, count);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${key}-${toDateOnly(todayDate())}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  },
});
