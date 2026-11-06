import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, ArrowUpRight, Coins, FolderKanban, Landmark, ListChecks, ShieldAlert, TrendingUp, Users, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActor, getClientScope } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { recentPeriods } from "@/server/modules/finance/service";
import { dashboardData, dashboardQuery } from "@/server/modules/reports/dashboard";
import { formatDate, formatDateTime, greetingKey } from "@/lib/dates";
import { formatMoney, formatPercent, money } from "@/lib/money";
import { ActivityFeed } from "@/components/patterns/activity-feed";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { Forbidden } from "@/components/patterns/forbidden";
import { FilterBar } from "@/components/patterns/list";
import { RecordLink, RecordTable } from "@/components/patterns/record";
import { visibleNav } from "@/components/shell/nav";
import { EmptyState } from "@/components/patterns/states";
import { Badge, Panel, PanelHeader, StatTile } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("overview") };
}

const AGING = { CURRENT: "bg-[var(--chart-1)]", D1_30: "bg-[var(--chart-3)]", D31_60: "bg-[var(--chart-5)]", D60_PLUS: "bg-danger" } as const;

function DrillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="hover:text-primary">{children}</Link>;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const actor = await getActor();
  if (!can(actor, "overview:read")) {
    // Home isn't a dead end: land on the first page this person can open.
    const first = visibleNav(actor.permissions)[0]?.items[0]?.href;
    if (first) redirect(first);
    return <Forbidden />;
  }
  const scope = await getClientScope();
  const seeAll = can(actor, "audit:read");
  const q = dashboardQuery.parse(await searchParams);

  const [data, activity, clients, managers, regions] = await Promise.all([
    dashboardData(actor, q),
    db.auditEvent.findMany({ where: seeAll ? {} : { actorId: actor.id }, orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { name: true } } } }),
    can(actor, "client:read") ? clientOptions() : [],
    scope.kind === "all" && can(actor, "client:read") ? activeUserOptions() : [],
    db.region.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const firstName = actor.name.split(" ")[0];
  const m = (v: { toString(): string }) => formatMoney(v.toString(), { locale, compact: true });
  const months = recentPeriods(24);
  const { current, year, headcount, money: recv, trend } = data;
  const agingTotal = recv ? money(recv.total) : money(0);
  const showNet = data.companyView && can(actor, "dashboard:executive");
  const trendPoints = trend?.map((r) => ({ period: r.id, revenue: r.pnl.revenue.toNumber(), cost: r.pnl.directCost.toNumber() })) ?? [];
  const hasTrend = trendPoints.some((p) => p.revenue !== 0 || p.cost !== 0);
  const classes = headcount ? (["SPONSORED", "NON_SPONSORED", "GOSI"] as const).map((c) => ({ label: t(`enums.Classification.${c}`), value: headcount[c], href: `/employees?classification=${c}` })).filter((x) => x.value > 0) : [];

  return (
    <>
      <div className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted num">{formatDate(new Date(), locale, "long")}</p>
          <h1 className="mt-1 font-display text-[40px] leading-[1.05] tracking-[-0.01em]">
            {t(`greeting.${greetingKey()}`)}
            {locale === "ar" ? "،" : ","} <em className="text-accent">{firstName}</em>
          </h1>
        </div>
        <p className="text-xs text-muted sm:text-end">
          {scope.kind === "all" ? t("overview.allClients") : t("overview.assigned", { count: scope.clientIds.length })}
          <span className="block num">{t("overview.refreshed", { time: formatDateTime(new Date(), locale) })}</span>
        </p>
      </div>

      <Panel>
        <FilterBar
          count={data.filtered ? t("overview.filtered") : undefined}
          filters={[
            { key: "period", type: "select", label: t("billing.month"), allLabel: months[0], options: months.map((p) => ({ value: p, label: p })) },
            ...(clients.length ? [{ key: "client", type: "select" as const, label: t("employees.client"), allLabel: t("employees.allClients"), options: clients }] : []),
            ...(managers.length ? [{ key: "manager", type: "select" as const, label: t("finance.manager"), allLabel: t("overview.allManagers"), options: managers }] : []),
            { key: "region", type: "select", label: t("overview.region"), allLabel: t("overview.allRegions"), options: regions.map((r) => ({ value: r.id, label: r.name })) },
          ]}
        />
      </Panel>

      <div className="card-grid grid-cols-2 lg:grid-cols-4">
        {current && <StatTile icon={<Coins />} label={t("overview.revenueMonth")} value={<DrillLink href="/finance/pnl?view=clients">{m(current.revenue)}</DrillLink>} />}
        {current && <StatTile icon={<TrendingUp />} label={`${t("finance.margin")}`} value={<DrillLink href="/finance/pnl?view=months">{formatPercent(current.contributionMargin)}</DrillLink>} />}
        {year && <StatTile icon={<Wallet />} label={t(showNet ? "overview.netYear" : "overview.contributionYear")} value={m(showNet ? year.netProfit : year.contribution)} />}
        {headcount && <StatTile icon={<Users />} label={t("overview.headcount")} value={<DrillLink href="/employees">{headcount.total}</DrillLink>} />}
        {recv && <StatTile icon={<Landmark />} label={t("billing.receivables")} value={<DrillLink href="/billing">{m(recv.total)}</DrillLink>} />}
        {recv && <StatTile icon={<AlarmClock />} label={t("billing.overdue")} value={<DrillLink href="/billing?view=overdue">{m(recv.overdue)}</DrillLink>} />}
        {data.escalations !== null && <StatTile icon={<ShieldAlert />} label={t("overview.openEscalations")} value={<DrillLink href="/escalations">{data.escalations}</DrillLink>} />}
        {data.breachedCases !== null && <StatTile icon={<FolderKanban />} label={t("overview.overdueCases", { open: data.openCases ?? 0 })} value={<DrillLink href="/cases?view=overdue">{data.breachedCases}</DrillLink>} />}
        {data.overdueTasks !== null && !current && <StatTile icon={<ListChecks />} label={t("tasks.overdue")} value={<DrillLink href="/tasks?view=overdue">{data.overdueTasks}</DrillLink>} />}
      </div>

      {trend && (
        <Panel>
          <PanelHeader title={t("overview.trend")} description={t("overview.trendHint")} />
          <div className="p-5 pt-3">
            {hasTrend ? (
              <>
                <TrendChart points={trendPoints} locale={locale} labels={{ revenue: t("finance.revenue"), cost: t("finance.directCost"), contribution: t("finance.contribution"), summary: t("overview.trendHint") }} />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs text-muted hover:text-fg">{t("overview.showTable")}</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-xs">
                      <thead><tr className="text-muted"><th className="py-1 text-start font-medium">{t("billing.month")}</th><th className="py-1 text-end font-medium">{t("finance.revenue")}</th><th className="py-1 text-end font-medium">{t("finance.directCost")}</th><th className="py-1 text-end font-medium">{t("finance.contribution")}</th></tr></thead>
                      <tbody>{trend.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1 num"><bdi>{r.id}</bdi></td><td className="py-1 text-end num">{formatMoney(r.pnl.revenue, { locale })}</td><td className="py-1 text-end num">{formatMoney(r.pnl.directCost, { locale })}</td><td className="py-1 text-end num">{formatMoney(r.pnl.contribution, { locale, accounting: true })}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <EmptyState compact title={t("finance.noPnl")} description={t("finance.noPnlBody")} />
            )}
          </div>
        </Panel>
      )}

      {headcount && (
        <div className="card-grid items-start lg:grid-cols-3">
          <Panel>
            <PanelHeader title={t("overview.bySponsor")} />
            <div className="p-5 pt-3"><BarList items={headcount.bySponsor} otherLabel={t("overview.other")} emptyLabel={t("overview.noPeople")} /></div>
          </Panel>
          <Panel>
            <PanelHeader title={t("overview.byClassification")} />
            <div className="p-5 pt-3"><BarList items={classes} otherLabel={t("overview.other")} emptyLabel={t("overview.noPeople")} /></div>
          </Panel>
          <Panel>
            <PanelHeader title={t("overview.byClient")} />
            <div className="p-5 pt-3"><BarList items={headcount.byClient.map((c) => ({ ...c, href: headcount.clientIds[c.label] ? `/employees?client=${headcount.clientIds[c.label]}` : undefined }))} otherLabel={t("overview.other")} emptyLabel={t("overview.noPeople")} /></div>
          </Panel>
        </div>
      )}

      {recv && !agingTotal.isZero() && (
        <Panel>
          <PanelHeader title={t("billing.aging")} description={t("billing.agingHint")} />
          <div className="grid gap-3 p-5 pt-3">
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("billing.aging")}>
              {(Object.keys(AGING) as (keyof typeof AGING)[]).map((k) => <span key={k} className={AGING[k]} style={{ inlineSize: `${money(recv.aging[k]).dividedBy(agingTotal).times(100).toFixed(2)}%` }} />)}
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(Object.keys(AGING) as (keyof typeof AGING)[]).map((k) => (
                <div key={k}>
                  <dt className="flex items-center gap-1.5 text-xs text-muted"><span className={`size-2 rounded-full ${AGING[k]}`} />{t(`billing.aging_${k}`)}</dt>
                  <dd className="text-sm font-medium num">{formatMoney(recv.aging[k], { locale })}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      )}

      <div className="card-grid items-start lg:grid-cols-2">
        {data.myTasks && (
          <Panel>
            <PanelHeader title={t("overview.priorities")} description={t("overview.prioritiesHint")} actions={<Link href="/tasks" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">{t("meta.tasks")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" /></Link>} />
            <RecordTable
              rows={data.myTasks}
              rowKey={(x) => x.id}
              emptyTitle={t("overview.noPriorities")}
              columns={[
                { header: t("reports.subject"), cell: (x) => <RecordLink href={`/tasks/${x.id}`} sub={<bdi>{x.number}</bdi>}>{x.title}</RecordLink> },
                { header: t("billing.dueDate"), nowrap: true, cell: (x) => (x.dueAt ? formatDate(x.dueAt, locale) : "—") },
              ]}
            />
          </Panel>
        )}
        {data.attention && (
          <Panel>
            <PanelHeader title={t("overview.attention")} description={t("overview.attentionHint")} actions={can(actor, "report:read") && <Link href="/reports/client-issues" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">{t("reports.name_client-issues")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" /></Link>} />
            <RecordTable
              rows={data.attention}
              rowKey={(c) => c.id}
              emptyTitle={t("overview.allHealthy")}
              columns={[
                { header: t("employees.client"), cell: (c) => <RecordLink href={`/clients/${c.id}`}>{c.displayName}</RecordLink> },
                { header: t("clients.health"), cell: (c) => <Badge tone={c.health === "AT_RISK" ? "danger" : "warning"} dot>{t(`enums.ClientHealth.${c.health}`)}</Badge> },
              ]}
            />
          </Panel>
        )}
      </div>

      <div className="card-grid items-start lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader
            title={t(seeAll ? "overview.activity" : "overview.activityOwn")}
            description={t(seeAll ? "overview.activityAll" : "overview.activityOwnHint")}
            actions={seeAll ? <Link href="/admin/audit" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline">{t("overview.auditLink")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" /></Link> : undefined}
          />
          {activity.length ? <ActivityFeed items={activity} className="py-1" /> : <EmptyState compact title={t("overview.nothing")} description={t("overview.nothingHint")} />}
        </Panel>
        {(current || recv) && (
          <Panel>
            <PanelHeader title={t("overview.definitions")} description={t("overview.definitionsHint")} />
            <dl className="grid gap-3 px-5 pb-5 text-sm">
              {(["revenue", "directCost", "contribution", "margin", "netProfit", "receivables"] as const).map((k) => (
                <div key={k}>
                  <dt className="font-medium">{t(`overview.def_${k}_name`)}</dt>
                  <dd className="text-xs text-muted">{t(`overview.def_${k}`)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}
      </div>
    </>
  );
}
