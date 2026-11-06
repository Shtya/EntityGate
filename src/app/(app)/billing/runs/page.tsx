import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listRuns } from "@/server/modules/billing/service";
import { periodOf, todayDate } from "@/lib/dates";
import { add, formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { RUN_TONE } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("billing"))("runs") };
}

export default async function RunsPage() {
  const actor = await getActor();
  if (!can(actor, "billing_run:manage")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const runs = await listRuns();
  return (
    <>
      <PageHeader
        eyebrow={t("billing.title")}
        title={t("billing.runs")}
        description={t("billing.runsHint")}
        actions={<FormButton label={t("billing.newRun")} title={t("billing.newRun")} description={t("billing.newRunHint")} endpoint="/billing/runs" submitLabel={t("billing.generate")} redirectTo="/billing/runs/{id}" initial={{ period: periodOf(todayDate()) }} fields={[{ name: "period", label: t("billing.month"), required: true, ltr: true, hint: "2026-09", wide: true }]} />}
      />
      <Panel>
        <RecordTable
          rows={runs}
          rowKey={(r) => r.id}
          emptyTitle={t("billing.noRuns")}
          emptyBody={t("billing.noRunsBody")}
          columns={[
            { header: t("billing.month"), cell: (r) => <RecordLink href={`/billing/runs/${r.id}`}><bdi>{r.period}</bdi></RecordLink> },
            { header: t("billing.invoices"), align: "end", cell: (r) => <span className="num">{r.invoices.length}</span> },
            { header: t("billing.total"), align: "end", nowrap: true, cell: (r) => formatMoney(add(...r.invoices.map((i) => i.total.toString())), { locale }) },
            { header: t("tasks.createdBy"), hideOnMobile: true, cell: (r) => r.createdBy.name },
            { header: t("billing.approvedBy"), hideOnMobile: true, cell: (r) => r.approvedBy?.name ?? "—" },
            { header: t("common.status"), cell: (r) => <Badge tone={RUN_TONE[r.status]} dot>{t(`enums.BillingRunStatus.${r.status}`)}</Badge> },
          ]}
        />
      </Panel>
    </>
  );
}
