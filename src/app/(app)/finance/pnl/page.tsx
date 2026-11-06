import type { Metadata } from "next";
import { BarChart3, Coins, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { pnlQuery } from "@/server/modules/finance/schema";
import { pnl, recentPeriods, type PnlRow } from "@/server/modules/finance/service";
import { formatMoney, formatPercent } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FilterBar } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { PageTabs, RecordTable } from "@/components/patterns/record";
import { Panel, StatTile } from "@/components/ui/misc";
import { FinanceTabs } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("finance"))("pnl") };
}

export default async function PnlPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "finance:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const raw = await searchParams;
  const q = pnlQuery.parse(raw);
  const months = recentPeriods(24);
  const to = q.to ?? months[0];
  const from = q.from ?? (q.to && q.to < months[5] ? q.to : months[5]);
  const data = await pnl(from <= to ? from : to, to);
  const m = (v: { toString(): string }, compact = false) => formatMoney(v.toString(), { locale, compact, accounting: !compact });
  const pct = (v: PnlRow["pnl"]["contributionMargin"]) => (v === null ? "—" : formatPercent(v));
  const keep = Object.entries(raw).filter(([k]) => k !== "view");
  const tabHref = (view: string) => `/finance/pnl?${new URLSearchParams([...keep, ["view", view]])}`;
  const options = months.map((p) => ({ value: p, label: p }));
  const rows: PnlRow[] = q.view === "clients" ? data.clients : q.view === "managers" ? data.managers : data.months;

  return (
    <>
      <PageHeader eyebrow={t("nav.money")} title={t("finance.title")} description={t("finance.pnlHint")} />
      <FinanceTabs actor={actor} active="pnl" t={t} />
      <div className="card-grid grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Coins />} label={t("finance.revenue")} value={m(data.company.revenue, true)} />
        <StatTile icon={<Wallet />} label={t("finance.directCost")} value={m(data.company.directCost, true)} />
        <StatTile icon={<TrendingUp />} label={`${t("finance.contribution")} (${pct(data.company.contributionMargin)})`} value={m(data.company.contribution, true)} />
        {data.companyView ? <StatTile icon={<BarChart3 />} label={t("finance.netProfit")} value={m(data.company.netProfit, true)} /> : <StatTile icon={<BarChart3 />} label={t("finance.clients")} value={data.clients.length} />}
      </div>
      <PageTabs
        active={q.view}
        tabs={[
          { key: "clients", label: t("finance.byClient"), href: tabHref("clients") },
          { key: "managers", label: t("finance.byManager"), href: tabHref("managers") },
          { key: "months", label: t("finance.byMonth"), href: tabHref("months") },
        ]}
      />
      <Panel>
        <FilterBar
          count={`${data.from} – ${data.to}`}
          filters={[
            { key: "from", type: "select", label: t("finance.from"), allLabel: months[5], options },
            { key: "to", type: "select", label: t("finance.to"), allLabel: months[0], options },
          ]}
        />
        <RecordTable
          rows={rows}
          rowKey={(r) => r.id}
          emptyTitle={t("finance.noPnl")}
          emptyBody={t("finance.noPnlBody")}
          minWidth={720}
          columns={[
            {
              header: t(q.view === "clients" ? "employees.client" : q.view === "managers" ? "finance.manager" : "billing.month"),
              cell: (r) => (q.view === "clients" ? <Link className="font-medium hover:text-primary" href={`/clients/${r.id}?tab=finance`}>{r.name}</Link> : q.view === "months" ? <bdi className="font-medium num">{r.name}</bdi> : <span className="font-medium">{r.name || t("finance.noOwner")}</span>),
            },
            { header: t("finance.revenue"), align: "end", nowrap: true, cell: (r) => m(r.pnl.revenue) },
            { header: t("finance.directCost"), align: "end", nowrap: true, cell: (r) => m(r.pnl.directCost) },
            { header: t("finance.contribution"), align: "end", nowrap: true, cell: (r) => <span className={r.pnl.contribution.isNegative() ? "font-medium text-danger" : "font-medium"}>{m(r.pnl.contribution)}</span> },
            { header: t("finance.margin"), align: "end", cell: (r) => pct(r.pnl.contributionMargin) },
            ...(q.view === "months" && data.companyView
              ? [
                  { header: t("finance.overhead"), align: "end" as const, nowrap: true, cell: (r: PnlRow) => m(r.pnl.overhead) },
                  { header: t("finance.netProfit"), align: "end" as const, nowrap: true, cell: (r: PnlRow) => <span className="font-medium">{m(r.pnl.netProfit)}</span> },
                ]
              : []),
          ]}
        />
        {data.companyView && q.view !== "months" && (
          <p className="border-t border-border px-5 py-3 text-xs text-muted">{t("finance.belowTheLine", { overhead: m(data.company.overhead), unallocated: m(data.unallocated) })}</p>
        )}
      </Panel>
    </>
  );
}
