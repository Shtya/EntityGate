import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listPayrollRuns, recentPeriods } from "@/server/modules/finance/service";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { FinanceTabs } from "../shared";
import { PayrollImport } from "./payroll-import";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("payroll") };
}

export default async function PayrollPage() {
  const actor = await getActor();
  if (!can(actor, "payroll:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const runs = await listPayrollRuns();
  const months = recentPeriods(12).map((p) => ({ value: p, label: p }));
  return (
    <>
      <PageHeader
        eyebrow={t("nav.money")}
        title={t("finance.payroll")}
        description={t("finance.payrollHint")}
        actions={
          can(actor, "payroll:manage") && (
            <>
              <PayrollImport periods={months} />
              <FormButton label={t("finance.generate")} title={t("finance.generate")} description={t("finance.generateHint")} endpoint="/payroll/generate" submitLabel={t("finance.generate")} redirectTo="/finance/payroll/{id}" initial={{ period: months[0].value }} fields={[{ name: "period", label: t("billing.month"), type: "select", required: true, wide: true, options: months }]} />
            </>
          )
        }
      />
      <FinanceTabs actor={actor} active="payroll" t={t} />
      <Panel>
        <RecordTable
          rows={runs}
          rowKey={(r) => r.id}
          emptyTitle={t("finance.noPayroll")}
          emptyBody={t("finance.noPayrollBody")}
          columns={[
            { header: t("billing.month"), cell: (r) => <RecordLink href={`/finance/payroll/${r.id}`}><bdi>{r.period}</bdi></RecordLink> },
            { header: t("finance.source"), hideOnMobile: true, cell: (r) => t(`enums.PayrollSource.${r.source}`) },
            { header: t("finance.lines"), align: "end", cell: (r) => <span className="num">{r.people}</span> },
            { header: t("finance.totalCost"), align: "end", nowrap: true, cell: (r) => <span className="font-medium">{formatMoney(r.total, { locale })}</span> },
            { header: t("common.status"), cell: (r) => <Badge tone={r.status === "CONFIRMED" ? "success" : "neutral"} dot>{t(`enums.PayrollRunStatus.${r.status}`)}</Badge> },
          ]}
        />
      </Panel>
    </>
  );
}
