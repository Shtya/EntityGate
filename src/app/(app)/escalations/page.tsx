import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { listEscalationsQuery, SEVERITIES } from "@/server/modules/operations/schema";
import { listEscalations } from "@/server/modules/operations/service";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs } from "@/components/patterns/record";
import { EmptyState } from "@/components/patterns/states";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { SEVERITY_TONE } from "../cases/shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("escalations") };
}

export default async function EscalationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "escalation:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listEscalationsQuery.parse(await searchParams);
  const [rows, clients, users, policies] = await Promise.all([listEscalations(q.status, actor), clientOptions(), activeUserOptions(), db.slaPolicy.findMany({ where: { scope: "escalation" } })]);
  const now = Date.now();
  const openDays = (from: Date) => Math.floor((now - from.getTime()) / 86_400_000);
  const canManage = can(actor, "escalation:manage");

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("escalations.title")}
        description={t("escalations.description")}
        actions={
          can(actor, "escalation:raise") && (
            <FormButton
              wide
              label={t("escalations.raise")}
              title={t("escalations.raise")}
              endpoint="/escalations"
              submitLabel={t("escalations.raise")}
              initial={{ ownerId: actor.id, severity: "HIGH" }}
              fields={[
                { name: "title", label: t("escalations.issue"), required: true, wide: true },
                { name: "severity", label: t("cases.severity"), type: "select", required: true, options: SEVERITIES.map((s) => ({ value: s, label: t(`enums.Severity.${s}`) })) },
                { name: "ownerId", label: t("tasks.owner"), type: "select", required: true, options: users },
                { name: "clientId", label: t("employees.client"), type: "select", options: clients },
                { name: "impactAmount", label: t("escalations.impactAmount"), type: "money" },
                { name: "impactText", label: t("escalations.impactText"), wide: true },
              ]}
            />
          )
        }
      />
      <PageTabs active={q.status} tabs={[{ key: "active", label: t("escalations.active"), href: "/escalations" }, { key: "resolved", label: t("escalations.resolved"), href: "/escalations?status=resolved" }]} />
      {rows.length === 0 ? (
        <Panel><EmptyState title={t(q.status === "active" ? "escalations.emptyActive" : "escalations.emptyResolved")} description={t("escalations.emptyBody")} /></Panel>
      ) : (
        rows.map((e) => {
          const overdue = e.nextUpdateDueAt && e.nextUpdateDueAt.getTime() < now;
          return (
            <Panel key={e.id}>
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start">
                <span className={`grid size-10 shrink-0 place-items-center rounded-md ${e.severity === "CRITICAL" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
                  <ShieldAlert className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[e.severity]}>{t(`enums.Severity.${e.severity}`)}</Badge>
                    <Code>{e.number}</Code>
                    {e.client && <Link className="text-xs text-primary hover:underline" href={`/clients/${e.client.id}`}>{e.client.displayName}</Link>}
                    {e.case && <Link className="text-xs text-primary hover:underline" href={`/cases/${e.case.id}`}>{e.case.number}</Link>}
                    {!e.raisedById && <Badge tone="info">{t("escalations.auto")}</Badge>}
                  </div>
                  <h2 className="mt-1 text-sm font-semibold">{e.title}</h2>
                  <p className="text-xs text-muted">{t("tasks.owner")}: {e.owner.name}</p>
                  {e.updates.length > 0 && (
                    <ul className="mt-2 grid gap-1 border-s-2 border-border ps-3">
                      {e.updates.map((u) => (
                        <li key={u.id} className="text-xs"><span className="font-medium">{u.author.name}</span> <span className="text-faint num">{formatDateTime(u.createdAt, locale)}</span><p className="whitespace-pre-wrap">{u.note}</p></li>
                      ))}
                    </ul>
                  )}
                </div>
                <dl className="grid shrink-0 grid-cols-3 gap-5 text-sm lg:w-[360px]">
                  <div><dt className="text-xs text-faint">{t("escalations.impact")}</dt><dd className="num font-medium">{e.impactAmount ? formatMoney(e.impactAmount.toString(), { locale }) : (e.impactText ?? "—")}</dd></div>
                  <div><dt className="text-xs text-faint">{t("escalations.openFor")}</dt><dd className="num font-medium">{t("escalations.days", { days: openDays(e.raisedAt) })}</dd></div>
                  <div><dt className="text-xs text-faint">{t("escalations.nextUpdate")}</dt><dd className={`num ${overdue ? "font-medium text-danger" : ""}`}>{e.nextUpdateDueAt ? formatDateTime(e.nextUpdateDueAt, locale) : "—"}</dd></div>
                </dl>
                {canManage && e.status !== "RESOLVED" && (
                  <div className="flex shrink-0 gap-2">
                    <FormButton size="sm" variant="secondary" label={t("escalations.update")} title={t("escalations.update")} endpoint={`/escalations/${e.id}/update`} submitLabel={t("escalations.update")} fields={[{ name: "note", label: t("escalations.note"), type: "textarea", required: true }]} />
                    <FormButton size="sm" label={t("escalations.resolve")} title={t("escalations.resolve")} endpoint={`/escalations/${e.id}/resolve`} submitLabel={t("escalations.resolve")} fields={[{ name: "note", label: t("cases.resolution"), type: "textarea", required: true }]} />
                  </div>
                )}
              </div>
            </Panel>
          );
        })
      )}
      <Panel>
        <PanelHeader title={t("escalations.policy")} description={t("escalations.policyHint")} />
        <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-4">
          {SEVERITIES.map((s) => {
            const p = policies.find((x) => x.severity === s);
            return (
              <li key={s} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                <Badge tone={SEVERITY_TONE[s]}>{t(`enums.Severity.${s}`)}</Badge>
                <span className="text-muted">{p ? t(p.businessHoursOnly ? "escalations.withinWorking" : "escalations.within", { hours: p.updateWithinHours }) : "—"}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
