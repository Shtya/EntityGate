import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getActorOrNull } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { findReport, reportQuery, reportRange } from "@/server/modules/reports/definitions";
import { logExport, reportCell } from "@/server/modules/reports/export";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { PrintButton } from "../../invoices/[id]/print-button";

export const metadata: Metadata = { title: "Report" };

/** Printing is an export too, so it needs the same permission and leaves the same record. */
export default async function PrintReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const t = await getTranslations();
  const { key } = await params;
  const def = findReport(key);
  if (!def || !can(actor, "report:export") || !can(actor, def.permission)) return <p className="p-10">{t("states.forbiddenTitle")}</p>;
  const locale = await getLocale();
  const range = reportRange(reportQuery.parse(await searchParams));
  const rows = await def.run(actor, range);
  await logExport(actor, def.key, "print", { from: range.from, to: range.to, client: range.client }, rows.length);
  const numeric = (type?: string) => type === "money" || type === "int" || type === "percent";

  return (
    <main className="mx-auto min-h-dvh max-w-[1100px] bg-white p-10 text-[12px] text-black print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden"><PrintButton label={t("billing.print")} /></div>
      <header className="mb-4 border-b border-black/20 pb-3">
        <h1 className="text-lg font-semibold">{t(`reports.name_${key}`)}</h1>
        <p className="text-xs text-black/60 num">
          {def.usesPeriod && <bdi>{range.from} – {range.to} · </bdi>}
          {formatDateTime(new Date(), locale)} · {actor.name} · {t("reports.rowCount", { count: rows.length })}
        </p>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black/40">
            {def.columns.map((c) => <th key={c.key} className={`py-1.5 pe-3 font-medium ${numeric(c.type) ? "text-end" : "text-start"}`}>{t(c.label)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-black/10">
              {def.columns.map((c) => {
                const v = reportCell(def, c.key, row[c.key], t);
                const shown = v === null ? "—" : c.type === "money" ? formatMoney(String(v), { locale, accounting: true }) : c.type === "percent" ? formatPercent(Number(v)) : String(v);
                return <td key={c.key} className={`py-1 pe-3 ${numeric(c.type) ? "text-end tabular-nums" : ""}`}>{shown}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
