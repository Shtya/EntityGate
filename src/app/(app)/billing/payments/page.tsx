import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { clientOptions } from "@/server/modules/clients/service";
import { listPaymentsQuery } from "@/server/modules/billing/schema";
import { listPayments } from "@/server/modules/billing/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { add, formatMoney, money } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { paymentFields } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("billing"))("payments") };
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "payment:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listPaymentsQuery.parse(await searchParams);
  const [{ rows, total, page }, clients] = await Promise.all([listPayments(q), clientOptions()]);
  const m = (v: unknown) => formatMoney(String(v), { locale });

  return (
    <>
      <PageHeader
        eyebrow={t("billing.title")}
        title={t("billing.payments")}
        description={t("billing.paymentsHint")}
        actions={can(actor, "payment:record") && <FormButton label={t("billing.recordPayment")} title={t("billing.recordPayment")} description={t("billing.fifoHint")} endpoint="/payments" submitLabel={t("billing.recordPayment")} successMessage={t("billing.paymentSaved")} initial={{ receivedAt: toDateOnly(todayDate()), method: "bank_transfer" }} fields={paymentFields(t, clients)} wide />}
      />
      <Panel>
        <FilterBar
          count={t("billing.paymentCount", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("billing.searchPayments") },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
          ]}
        />
        <RecordTable
          rows={rows}
          rowKey={(p) => p.id}
          emptyTitle={t("billing.noPayments")}
          minWidth={860}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("billing.receivedOn"), nowrap: true, cell: (p) => formatDate(p.receivedAt, locale) },
            { header: t("employees.client"), cell: (p) => p.client.displayName },
            { header: t("billing.reference"), hideOnMobile: true, cell: (p) => (p.reference ? <Code>{p.reference}</Code> : "—") },
            { header: t("billing.amount"), align: "end", nowrap: true, cell: (p) => <span className="font-medium">{m(p.amount.toString())}</span> },
            {
              header: t("billing.appliedTo"),
              cell: (p) =>
                p.allocations.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {p.allocations.map((a) => <Link key={a.id} className="text-xs text-primary hover:underline" href={`/billing/invoices/${a.invoice.id}`}><bdi>{a.invoice.number}</bdi></Link>)}
                  </span>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
            {
              header: t("billing.onAccount"),
              align: "end",
              nowrap: true,
              cell: (p) => {
                const left = money(p.amount.toString()).minus(add(...p.allocations.map((a) => a.amount.toString())));
                if (left.lessThanOrEqualTo(0)) return <span className="text-faint">—</span>;
                return (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-warning num">{m(left.toFixed(2))}</span>
                    {can(actor, "payment:record") && <ActionButton variant="ghost" label={t("billing.apply")} endpoint={`/payments/${p.id}/apply`} />}
                  </span>
                );
              },
            },
            {
              header: t("billing.reconciled"),
              cell: (p) =>
                can(actor, "payment:reconcile") ? (
                  <ActionButton variant="ghost" label={t(p.reconciled ? "billing.reconciledYes" : "billing.markReconciled")} endpoint={`/payments/${p.id}/reconcile`} json={{ reconciled: !p.reconciled }} />
                ) : (
                  <Badge tone={p.reconciled ? "success" : "neutral"}>{t(p.reconciled ? "common.yes" : "common.no")}</Badge>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
