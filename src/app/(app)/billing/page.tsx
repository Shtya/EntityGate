import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, HandCoins, Landmark, Receipt } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { clientOptions } from "@/server/modules/clients/service";
import { INVOICE_STATUSES, listInvoicesQuery } from "@/server/modules/billing/schema";
import { listInvoices, receivables } from "@/server/modules/billing/service";
import { serviceOptions } from "@/server/modules/price-list/service";
import { formatDate, todayDate } from "@/lib/dates";
import { daysPastDue } from "@/lib/finance";
import { formatMoney, money } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordLink, RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PanelHeader, StatTile } from "@/components/ui/misc";
import { INVOICE_TONE, invoiceFields } from "./shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("billing") };
}

const AGING_COLOR = { CURRENT: "bg-[var(--chart-1)]", D1_30: "bg-[var(--chart-3)]", D31_60: "bg-[var(--chart-5)]", D60_PLUS: "bg-danger" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "invoice:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listInvoicesQuery.parse(await searchParams);
  const [{ rows, total, page }, stats, clients, services] = await Promise.all([listInvoices(q), receivables(), clientOptions(), serviceOptions(locale)]);
  const today = todayDate();
  const m = (v: unknown, compact = false) => formatMoney(String(v), { locale, compact });
  const totalAging = money(stats.total);

  return (
    <>
      <PageHeader
        eyebrow={t("nav.money")}
        title={t("billing.title")}
        description={t("billing.description")}
        actions={
          <>
            {can(actor, "billing_run:manage") && <Button asChild variant="secondary"><Link href="/billing/runs">{t("billing.runs")}</Link></Button>}
            {can(actor, "invoice:create") && <FormButton label={t("billing.addInvoice")} title={t("billing.addInvoice")} description={t("billing.addInvoiceHint")} endpoint="/invoices" submitLabel={t("billing.createDraft")} redirectTo="/billing/invoices/{id}" initial={{ type: "ONE_OFF", quantity: "1" }} fields={invoiceFields(t, clients, services)} wide />}
          </>
        }
      />
      <div className="card-grid grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Landmark />} label={t("billing.receivables")} value={m(stats.total, true)} />
        <StatTile icon={<AlarmClock />} label={t("billing.overdue")} value={<Link className="hover:text-primary" href="/billing?view=overdue">{m(stats.overdue, true)}</Link>} />
        <StatTile icon={<HandCoins />} label={t("billing.collectedMonth")} value={m(stats.collectedMonth, true)} />
        <StatTile icon={<Receipt />} label={t("billing.unbilled")} value={stats.unbilled} />
      </div>
      <Panel>
        <PanelHeader title={t("billing.aging")} description={t("billing.agingHint")} />
        <div className="grid gap-3 p-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={t("billing.aging")}>
            {(Object.keys(AGING_COLOR) as (keyof typeof AGING_COLOR)[]).map((k) =>
              totalAging.isZero() ? null : <span key={k} className={AGING_COLOR[k]} style={{ inlineSize: `${money(stats.aging[k]).dividedBy(totalAging).times(100).toFixed(2)}%` }} />,
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(Object.keys(AGING_COLOR) as (keyof typeof AGING_COLOR)[]).map((k) => (
              <div key={k}>
                <dt className="flex items-center gap-1.5 text-xs text-muted"><span className={`size-2 rounded-full ${AGING_COLOR[k]}`} />{t(`billing.aging_${k}`)}</dt>
                <dd className="text-sm font-medium num">{m(stats.aging[k])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>
      <PageTabs
        active={q.view}
        tabs={[
          { key: "open", label: t("billing.view_open"), href: "/billing" },
          { key: "overdue", label: t("billing.view_overdue"), href: "/billing?view=overdue" },
          { key: "all", label: t("billing.view_all"), href: "/billing?view=all" },
          { key: "price-list", label: t("nav.priceList"), href: "/billing/price-list" },
          ...(can(actor, "payment:read") ? [{ key: "payments", label: t("billing.payments"), href: "/billing/payments" }] : []),
        ]}
      />
      <Panel>
        <FilterBar
          count={t("billing.count", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("billing.search") },
            { key: "status", type: "select", label: t("common.status"), allLabel: t("clients.allStatuses"), options: INVOICE_STATUSES.map((s) => ({ value: s, label: t(`enums.InvoiceStatus.${s}`) })) },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="invoices" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(i) => i.id}
          emptyTitle={t("billing.emptyTitle")}
          emptyBody={t("billing.emptyBody")}
          minWidth={820}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("billing.invoice"), cell: (i) => <RecordLink href={`/billing/invoices/${i.id}`} sub={t(`enums.InvoiceType.${i.type}`)}>{i.number ? <Code>{i.number}</Code> : t("billing.draft")}</RecordLink> },
            { header: t("employees.client"), cell: (i) => i.client.displayName },
            { header: t("billing.total"), align: "end", nowrap: true, cell: (i) => m(i.total.toString()) },
            { header: t("billing.outstanding"), align: "end", nowrap: true, cell: (i) => <span className="font-medium">{i.number ? m(i.outstanding) : "—"}</span> },
            { header: t("billing.dueDate"), nowrap: true, cell: (i) => (i.dueDate ? formatDate(i.dueDate, locale) : "—") },
            {
              header: t("billing.age"),
              align: "end",
              cell: (i) => {
                if (!i.dueDate || !["ISSUED", "PARTIALLY_PAID", "DISPUTED"].includes(i.status)) return <span className="text-faint">—</span>;
                const late = daysPastDue(i.dueDate, today);
                return late > 0 ? <span className="font-medium text-danger num">{t("employees.expiredDays2", { days: late })}</span> : <span className="text-faint">—</span>;
              },
            },
            { header: t("common.status"), cell: (i) => <Badge tone={INVOICE_TONE[i.status]} dot>{t(`enums.InvoiceStatus.${i.status}`)}</Badge> },
          ]}
        />
      </Panel>
    </>
  );
}
