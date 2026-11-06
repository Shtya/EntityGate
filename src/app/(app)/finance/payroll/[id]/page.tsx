import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { payrollItemsQuery } from "@/server/modules/finance/schema";
import { getPayrollRun } from "@/server/modules/finance/service";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton } from "@/components/patterns/form-dialog";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("payroll") };
}

export default async function PayrollRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "payroll:read")) return <Forbidden />;
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = payrollItemsQuery.parse(await searchParams);
  const { run, rows, total, page, sums } = await getPayrollRun(id, q);
  const m = (v: unknown) => formatMoney(String(v ?? 0), { locale });
  const confirmed = run.status === "CONFIRMED";
  return (
    <>
      <PageHeader
        eyebrow={t("finance.payroll")}
        title={run.period}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={confirmed ? "success" : "neutral"} dot>{t(`enums.PayrollRunStatus.${run.status}`)}</Badge>{t(`enums.PayrollSource.${run.source}`)} · {m(sums.totalCost)}</span>}
        actions={can(actor, "payroll:manage") && (confirmed ? <ActionButton label={t("finance.unconfirm")} endpoint={`/payroll/${id}/confirm`} json={{ approved: false }} /> : <ActionButton variant="primary" label={t("finance.confirm")} endpoint={`/payroll/${id}/confirm`} json={{ approved: true }} confirm={t("finance.confirmTitle")} confirmBody={t("finance.confirmBody")} />)}
      />
      <Panel>
        <FilterBar count={t("finance.lineCount", { count: total })} filters={[{ key: "q", type: "search", label: t("employees.search") }]} />
        <RecordTable
          rows={rows}
          rowKey={(i) => i.id}
          emptyTitle={t("finance.noLines")}
          minWidth={760}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("finance.employee"), cell: (i) => <RecordLink href={`/employees/${i.employee.id}`} sub={<bdi>{i.employee.employeeNo}</bdi>}>{i.employee.nameEn}</RecordLink> },
            { header: t("employees.client"), cell: (i) => i.client?.displayName ?? <span className="text-faint">{t("finance.unallocated")}</span> },
            { header: t("finance.gross"), align: "end", nowrap: true, cell: (i) => m(i.gross.toString()) },
            { header: t("finance.gosi"), align: "end", nowrap: true, hideOnMobile: true, cell: (i) => m(i.gosi.toString()) },
            { header: t("finance.otherCosts"), align: "end", nowrap: true, hideOnMobile: true, cell: (i) => m(i.otherCosts.toString()) },
            { header: t("finance.totalCost"), align: "end", nowrap: true, cell: (i) => <span className="font-medium">{m(i.totalCost.toString())}</span> },
          ]}
        />
      </Panel>
    </>
  );
}
