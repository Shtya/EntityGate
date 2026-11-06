import type { Metadata } from "next";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listPeriods } from "@/server/modules/finance/service";
import { formatDateTime } from "@/lib/dates";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { FinanceTabs } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("periods") };
}

export default async function PeriodsPage() {
  const actor = await getActor();
  if (!can(actor, "period:close")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await listPeriods();
  return (
    <>
      <PageHeader eyebrow={t("nav.money")} title={t("finance.periods")} description={t("finance.periodsHint")} />
      <FinanceTabs actor={actor} active="periods" t={t} />
      <Panel>
        <RecordTable
          rows={rows}
          rowKey={(p) => p.period}
          emptyTitle={t("finance.noPnl")}
          minWidth={720}
          columns={[
            { header: t("billing.month"), cell: (p) => <bdi className="font-medium num">{p.period}</bdi> },
            {
              header: t("finance.readiness"),
              cell: (p) => {
                if (p.status === "CLOSED") return <span className="text-xs text-muted">{t("finance.closedBy", { name: p.closedBy ?? "—", date: p.closedAt ? formatDateTime(p.closedAt, locale) : "—" })}</span>;
                if (p.ready) return <span className="inline-flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> {t("finance.readyToClose")}</span>;
                const gaps = [
                  p.payroll !== "CONFIRMED" && t("finance.gapPayroll"),
                  p.pendingExpenses > 0 && t("finance.gapExpenses", { count: p.pendingExpenses }),
                  p.unissuedInvoices > 0 && t("finance.gapInvoices", { count: p.unissuedInvoices }),
                ].filter(Boolean);
                return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><CircleAlert className="size-3.5 shrink-0 text-warning" /> {gaps.join(" · ")}</span>;
              },
            },
            { header: t("common.status"), cell: (p) => <Badge tone={p.status === "CLOSED" ? "neutral" : "success"} dot>{t(`enums.PeriodStatus.${p.status}`)}</Badge> },
            {
              header: "",
              align: "end",
              cell: (p) =>
                p.status === "CLOSED" ? (
                  <ActionButton variant="ghost" label={t("finance.reopen")} endpoint="/periods/reopen" json={{ period: p.period }} confirm={t("finance.reopenTitle")} confirmBody={t("finance.reopenBody")} />
                ) : p.ready ? (
                  <ActionButton label={t("finance.close")} endpoint="/periods/close" json={{ period: p.period }} confirm={t("finance.closeTitle")} confirmBody={t("finance.closeBody")} />
                ) : null,
            },
          ]}
        />
      </Panel>
    </>
  );
}
