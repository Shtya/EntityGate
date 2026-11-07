import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { clientOptions } from "@/server/modules/clients/service";
import { EXPENSE_STATUSES, listExpensesQuery } from "@/server/modules/finance/schema";
import { employeeOptionsForExpense, expenseCategories, listExpenses, recentPeriods } from "@/server/modules/finance/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { EXPENSE_TONE, expenseFields, FinanceTabs } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("expenses") };
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "expense:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listExpensesQuery.parse(await searchParams);
  const [{ rows, total, page, sum }, categories, clients, employees] = await Promise.all([listExpenses(q), expenseCategories(), clientOptions(), can(actor, "expense:create") ? employeeOptionsForExpense() : []]);
  const m = (v: unknown) => formatMoney(String(v), { locale });
  const approver = can(actor, "expense:approve");

  return (
    <>
      <PageHeader
        eyebrow={t("nav.money")}
        title={t("finance.expenses")}
        description={t("finance.expensesHint")}
        actions={can(actor, "expense:create") && <FormButton label={t("finance.addExpense")} title={t("finance.addExpense")} description={t("finance.addExpenseHint")} endpoint="/expenses" submitLabel={t("common.add")} successMessage={t("finance.expenseSaved")} initial={{ incurredAt: toDateOnly(todayDate()) }} fields={expenseFields(t, categories, clients, employees)} wide />}
      />
      <FinanceTabs actor={actor} active="expenses" t={t} />
      <Panel>
        <FilterBar
          count={`${t("finance.expenseCount", { count: total })} · ${m(sum)}`}
          filters={[
            { key: "q", type: "search", label: t("finance.searchExpenses") },
            { key: "status", type: "select", label: t("common.status"), allLabel: t("clients.allStatuses"), options: EXPENSE_STATUSES.map((s) => ({ value: s, label: t(`enums.ExpenseStatus.${s}`) })) },
            { key: "kind", type: "select", label: t("finance.kind"), allLabel: t("finance.allKinds"), options: (["DIRECT", "OVERHEAD"] as const).map((k) => ({ value: k, label: t(`enums.ExpenseKind.${k}`) })) },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
            { key: "month", type: "select", label: t("billing.month"), allLabel: t("finance.allMonths"), options: recentPeriods(24).map((p) => ({ value: p, label: p })) },
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="expenses" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(e) => e.id}
          emptyTitle={t("finance.noExpenses")}
          emptyBody={t("finance.noExpensesBody")}
          minWidth={900}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("finance.incurredAt"), nowrap: true, cell: (e) => formatDate(e.incurredAt, locale) },
            { header: t("billing.lineDescription"), cell: (e) => <span><span className="block font-medium">{e.description}</span><span className="block text-xs text-muted">{t.has(`enums.ExpenseCategory.${e.category.code}`) ? t(`enums.ExpenseCategory.${e.category.code}`) : e.category.name}{e.vendor && ` · ${e.vendor}`}{e.attachmentId && <> · <a className="text-primary hover:underline" href={`/api/v1/attachments/${e.attachmentId}`}>{t("finance.receipt")}</a></>}</span></span> },
            { header: t("employees.client"), hideOnMobile: true, cell: (e) => (e.client ? <span>{e.client.displayName}{e.employee && <span className="block text-xs text-muted">{e.employee.nameEn}</span>}</span> : <span className="text-faint">{t(`enums.ExpenseKind.${e.kind}`)}</span>) },
            { header: t("billing.amount"), align: "end", nowrap: true, cell: (e) => <span className="font-medium">{m(e.amount.toString())}</span> },
            {
              header: t("finance.recoverable"),
              cell: (e) => {
                if (!e.recoverable) return <span className="text-faint">—</span>;
                return e.billedLine ? <Link className="text-xs text-primary hover:underline" href={`/billing/invoices/${e.billedLine.invoiceId}`}><bdi>{e.billedLine.invoice.number ?? t("billing.draft")}</bdi></Link> : <Badge tone="info">{t("finance.notBilled")}</Badge>;
              },
            },
            { header: t("common.status"), cell: (e) => <Badge tone={EXPENSE_TONE[e.status]} dot>{t(`enums.ExpenseStatus.${e.status}`)}</Badge> },
            ...(approver
              ? [{
                  header: "",
                  align: "end" as const,
                  nowrap: true,
                  cell: (e: (typeof rows)[number]) =>
                    e.status === "PENDING" ? (
                      <span className="inline-flex gap-1">
                        <ActionButton label={t("billing.approve")} endpoint={`/expenses/${e.id}/decision`} json={{ approved: true }} />
                        <ActionButton variant="ghost" label={t("finance.reject")} endpoint={`/expenses/${e.id}/decision`} json={{ approved: false }} />
                      </span>
                    ) : null,
                }]
              : []),
          ]}
        />
      </Panel>
    </>
  );
}
