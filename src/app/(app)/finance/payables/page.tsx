import type { Metadata } from "next";
import { AlarmClock, Landmark } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { listPayablesQuery, PAYABLE_TYPES } from "@/server/modules/finance/schema";
import { listPayables } from "@/server/modules/finance/service";
import { formatDate, todayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordTable } from "@/components/patterns/record";
import { Badge, Panel, StatTile } from "@/components/ui/misc";
import { FinanceTabs, PAYABLE_TONE } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("payables") };
}

export default async function PayablesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "payable:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listPayablesQuery.parse(await searchParams);
  const { rows, total, page, open, overdue } = await listPayables(q);
  const today = todayDate();
  const m = (v: unknown, compact = false) => formatMoney(String(v), { locale, compact });
  const manage = can(actor, "payable:manage");
  return (
    <>
      <PageHeader
        eyebrow={t("nav.money")}
        title={t("finance.payables")}
        description={t("finance.payablesHint")}
        actions={
          manage && (
            <FormButton
              label={t("finance.addPayable")}
              title={t("finance.addPayable")}
              endpoint="/payables"
              submitLabel={t("common.add")}
              fields={[
                { name: "type", label: t("finance.kind"), type: "select", required: true, options: PAYABLE_TYPES.map((k) => ({ value: k, label: t(`enums.PayableType.${k}`) })) },
                { name: "amount", label: t("billing.amount"), type: "money", required: true },
                { name: "description", label: t("billing.lineDescription"), required: true, wide: true },
                { name: "dueDate", label: t("billing.dueDate"), type: "date", required: true },
                { name: "reference", label: t("billing.reference"), ltr: true },
              ]}
            />
          )
        }
      />
      <FinanceTabs actor={actor} active="payables" t={t} />
      <div className="card-grid grid-cols-2">
        <StatTile icon={<Landmark />} label={t("finance.openPayables")} value={m(open, true)} />
        <StatTile icon={<AlarmClock />} label={t("billing.overdue")} value={m(overdue, true)} />
      </div>
      <PageTabs active={q.status} tabs={(["OPEN", "PAID", "CANCELLED"] as const).map((s) => ({ key: s, label: t(`enums.PayableStatus.${s}`), href: `/finance/payables?status=${s}` }))} />
      <Panel>
        <RecordTable
          rows={rows}
          rowKey={(p) => p.id}
          emptyTitle={t("finance.noPayables")}
          emptyBody={t("finance.noPayablesBody")}
          minWidth={720}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("billing.dueDate"), nowrap: true, cell: (p) => <span className={p.status === "OPEN" && p.dueDate < today ? "font-medium text-danger" : undefined}>{formatDate(p.dueDate, locale)}</span> },
            { header: t("billing.lineDescription"), cell: (p) => <span><span className="block font-medium">{p.description}</span><span className="block text-xs text-muted">{t(`enums.PayableType.${p.type}`)}</span></span> },
            { header: t("billing.reference"), hideOnMobile: true, cell: (p) => (p.reference ? <Code>{p.reference}</Code> : "—") },
            { header: t("billing.amount"), align: "end", nowrap: true, cell: (p) => <span className="font-medium">{m(p.amount.toString())}</span> },
            { header: t("common.status"), cell: (p) => <Badge tone={PAYABLE_TONE[p.status]} dot>{t(`enums.PayableStatus.${p.status}`)}</Badge> },
            ...(manage
              ? [{
                  header: "",
                  align: "end" as const,
                  nowrap: true,
                  cell: (p: (typeof rows)[number]) =>
                    p.status === "OPEN" ? (
                      <span className="inline-flex gap-1">
                        <ActionButton label={t("finance.markPaid")} endpoint={`/payables/${p.id}/status`} json={{ status: "PAID" }} />
                        <ActionButton variant="ghost" label={t("common.cancel")} endpoint={`/payables/${p.id}/status`} json={{ status: "CANCELLED" }} />
                      </span>
                    ) : (
                      <ActionButton variant="ghost" label={t("finance.reopen")} endpoint={`/payables/${p.id}/status`} json={{ status: "OPEN" }} />
                    ),
                }]
              : []),
          ]}
        />
      </Panel>
    </>
  );
}
