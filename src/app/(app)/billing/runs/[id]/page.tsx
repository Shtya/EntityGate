import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { getRun } from "@/server/modules/billing/service";
import { add, formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { INVOICE_TONE, RUN_TONE } from "../../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("billing"))("runs") };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!can(actor, "billing_run:manage")) return <Forbidden />;
  const { id } = await params;
  const run = await getRun(id);
  const t = await getTranslations();
  const locale = await getLocale();
  const m = (v: unknown) => formatMoney(String(v), { locale });
  const sum = (k: "subtotal" | "vatAmount" | "total") => add(...run.invoices.map((i) => i[k].toString()));

  const missingPay = run.status !== "ISSUED" ? run.invoices.flatMap((i) => i.lines.map((l) => ({ ...l, client: i.client.displayName }))) : [];

  return (
    <>
      <PageHeader
        eyebrow={t("billing.runs")}
        title={run.period}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={RUN_TONE[run.status]} dot>{t(`enums.BillingRunStatus.${run.status}`)}</Badge>{t("billing.runSummary", { count: run.invoices.length, total: m(sum("total")) })}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
            {run.status === "DRAFT" && can(actor, "invoice:approve") && <ActionButton variant="primary" label={t("billing.approve")} endpoint={`/billing/runs/${id}/approve`} confirm={t("billing.approveConfirm")} confirmBody={t("billing.approveBody")} successMessage={t("billing.approved")} />}
            {run.status === "APPROVED" && can(actor, "invoice:issue") && <ActionButton variant="primary" label={t("billing.issueAll")} endpoint={`/billing/runs/${id}/issue`} confirm={t("billing.issueAllConfirm")} confirmBody={t("billing.issueBody")} successMessage={t("billing.issued")} />}
            {(run.status === "DRAFT" || run.status === "APPROVED") && <ActionButton variant="danger" label={t("billing.cancelRun")} endpoint={`/billing/runs/${id}/cancel`} confirm={t("billing.cancelRunConfirm")} confirmBody={t("billing.cancelRunBody")} redirectTo="/billing/runs" />}
          </div>
        }
      />
      {missingPay.length > 0 && (
        <Panel className="border-warning/40">
          <PanelHeader title={t("billing.missingPay")} description={t("billing.missingPayHint")} />
          <ul className="grid gap-1 px-5 pb-4 text-sm">
            {missingPay.map((l) => <li key={l.id}>{l.description} <span className="text-muted">· {l.client}</span></li>)}
          </ul>
        </Panel>
      )}
      <Panel>
        <RecordTable
          rows={run.invoices}
          rowKey={(i) => i.id}
          emptyTitle={t("billing.runEmpty")}
          emptyBody={t("billing.runEmptyBody")}
          columns={[
            { header: t("employees.client"), cell: (i) => <RecordLink href={`/billing/invoices/${i.id}`} sub={i.number ? <Code>{i.number}</Code> : t("billing.draft")}>{i.client.displayName}</RecordLink> },
            { header: t("billing.lines"), align: "end", hideOnMobile: true, cell: (i) => <span className="num">{i._count.lines}</span> },
            { header: t("billing.subtotal"), align: "end", nowrap: true, cell: (i) => m(i.subtotal.toString()) },
            { header: t("billing.vat"), align: "end", nowrap: true, hideOnMobile: true, cell: (i) => m(i.vatAmount.toString()) },
            { header: t("billing.total"), align: "end", nowrap: true, cell: (i) => <span className="font-medium">{m(i.total.toString())}</span> },
            { header: t("common.status"), cell: (i) => <Badge tone={INVOICE_TONE[i.status]} dot>{t(`enums.InvoiceStatus.${i.status}`)}</Badge> },
          ]}
        />
      </Panel>
    </>
  );
}
