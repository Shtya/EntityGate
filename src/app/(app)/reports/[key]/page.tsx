import type { Metadata } from "next";
import { Download, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { clientOptions } from "@/server/modules/clients/service";
import { recentPeriods } from "@/server/modules/finance/service";
import { findReport, reportQuery, reportRange, type ReportColumn, type ReportRow } from "@/server/modules/reports/definitions";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatPercent } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/misc";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const t = await getTranslations("reports");
  const { key } = await params;
  return { title: findReport(key) ? t(`name_${key}`) : t("title") };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  const { key } = await params;
  const def = findReport(key);
  if (!def) notFound();
  if (!can(actor, "report:read") || !can(actor, def.permission)) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const raw = await searchParams;
  const q = reportQuery.parse(raw);
  const range = reportRange(q);
  const [rows, clients] = await Promise.all([def.run(actor, range), clientOptions()]);
  const months = recentPeriods(36);
  const options = months.map((p) => ({ value: p, label: p }));
  const pageRows = rows.map((r, i): ReportRow => ({ ...r, __row: i })).slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE);
  const qs = new URLSearchParams(Object.entries(raw).filter(([k]) => ["from", "to", "client"].includes(k)));
  const link = (format: string) => `/api/v1/reports/${key}/export?${new URLSearchParams([...qs, ["format", format]])}`;

  const cell = (c: ReportColumn, row: ReportRow) => {
    const v = row[c.key];
    if (v === null || v === undefined) return <span className="text-faint">—</span>;
    if (v instanceof Date) return formatDate(v, locale);
    if (c.type === "money") return formatMoney(String(v), { locale, accounting: true });
    if (c.type === "percent") return formatPercent(Number(v));
    if (c.type === "int") return <span className="num">{v}</span>;
    if (c.enumNs && t.has(`${c.enumNs}.${v}`)) return t(`${c.enumNs}.${v}`);
    return String(v);
  };
  const numeric = (c: ReportColumn) => c.type === "money" || c.type === "int" || c.type === "percent";

  return (
    <>
      <PageHeader
        eyebrow={t("reports.title")}
        title={t(`reports.name_${key}`)}
        description={t(`reports.hint_${key}`)}
        actions={
          can(actor, "report:export") && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm"><a href={link("xlsx")}><Download /> Excel</a></Button>
              <Button asChild variant="secondary" size="sm"><a href={link("csv")}><Download /> CSV</a></Button>
              <Button asChild variant="secondary" size="sm"><a href={`/print/reports/${key}?${qs}`} target="_blank" rel="noreferrer"><Printer /> {t("billing.print")}</a></Button>
            </div>
          )
        }
      />
      <Panel>
        <FilterBar
          count={t("reports.rowCount", { count: rows.length })}
          filters={[
            ...(def.usesPeriod
              ? [
                  { key: "from", type: "select" as const, label: t("finance.from"), allLabel: months[5], options },
                  { key: "to", type: "select" as const, label: t("finance.to"), allLabel: months[0], options },
                ]
              : []),
            { key: "client", type: "select" as const, label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
          ]}
        />
        <RecordTable
          rows={pageRows}
          rowKey={(r) => String(r.__row)}
          emptyTitle={t("reports.emptyTitle")}
          emptyBody={t("reports.emptyBody")}
          minWidth={Math.max(640, def.columns.length * 130)}
          footer={rows.length > PAGE_SIZE ? <ListPager page={q.page} pageSize={PAGE_SIZE} total={rows.length} /> : undefined}
          columns={def.columns.map((c) => ({ header: t(c.label), align: numeric(c) ? ("end" as const) : undefined, nowrap: c.type === "money" || c.type === "date", cell: (row: ReportRow) => cell(c, row) }))}
        />
      </Panel>
    </>
  );
}
