import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { activeUserOptions } from "@/server/modules/clients/service";
import { getCase } from "@/server/modules/operations/service";
import { formatDateTime } from "@/lib/dates";
import { CommentThread } from "@/components/patterns/comments";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { DetailList } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { CaseExpenses } from "./case-expenses";
import { categoryLabel, FLOW, SEVERITY_TONE, StageTracker, STAGE_TONE } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("cases") };
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!can(actor, "case:read")) return <Forbidden />;
  const { id } = await params;
  let c;
  try {
    c = await getCase(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return <Forbidden />;
    throw e;
  }
  const t = await getTranslations();
  const locale = await getLocale();
  const closed = c.stage === "CLOSED";
  const canMove = can(actor, "case:update") && !closed;
  const at = FLOW.indexOf(c.stage as (typeof FLOW)[number]);
  const nextStage = c.stage === "REOPENED" || c.stage === "PENDING_EXTERNAL" ? "EXECUTION" : FLOW[at + 1];
  const late = !closed && c.slaDueAt && c.slaDueAt < new Date();

  return (
    <>
      <PageHeader
        eyebrow={c.number}
        title={c.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[c.stage]}>{t(`enums.CaseStage.${c.stage}`)}</Badge>
            <Badge tone={SEVERITY_TONE[c.severity]}>{t(`enums.Severity.${c.severity}`)}</Badge>
            {c.breached && <Badge tone="danger" dot>{t("cases.breached")}</Badge>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canMove && nextStage && nextStage !== "CLOSED" && <ActionButton variant="primary" label={t("cases.moveTo", { stage: t(`enums.CaseStage.${nextStage}`) })} endpoint={`/cases/${id}/stage`} json={{ stage: nextStage }} />}
            {canMove && c.stage !== "PENDING_EXTERNAL" && <ActionButton label={t("cases.waitExternal")} endpoint={`/cases/${id}/stage`} json={{ stage: "PENDING_EXTERNAL" }} />}
            {canMove && <FormButton size="sm" variant="secondary" label={t("tasks.reassign")} title={t("tasks.reassign")} endpoint={`/cases/${id}/reassign`} submitLabel={t("tasks.reassign")} initial={{ ownerId: c.owner.id }} fields={[{ name: "ownerId", label: t("tasks.owner"), type: "select", required: true, wide: true, options: await activeUserOptions() }]} />}
            {!closed && can(actor, "case:close") && (
              <FormButton size="sm" label={t("cases.close")} title={t("cases.close")} description={t("cases.closeHint")} endpoint={`/cases/${id}/close`} submitLabel={t("cases.close")} fields={[{ name: "resolutionNote", label: t("cases.resolution"), type: "textarea", required: true }, { name: "attachmentId", label: t("cases.evidence"), type: "file", wide: true }]} />
            )}
            {closed && can(actor, "case:reopen") && (
              <FormButton size="sm" variant="secondary" label={t("cases.reopen")} title={t("cases.reopen")} description={t("cases.reopenHint")} endpoint={`/cases/${id}/reopen`} submitLabel={t("cases.reopen")} fields={[{ name: "reason", label: t("cases.reason"), type: "textarea", required: true }]} />
            )}
          </div>
        }
      />
      <Panel>
        <StageTracker stage={c.stage} t={t} />
      </Panel>
      <div className="card-grid items-start lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card-grid">
          {c.resolutionNote && (
            <Panel>
              <PanelHeader title={t("cases.resolution")} />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm">{c.resolutionNote}</p>
            </Panel>
          )}
          <Panel>
            <PanelHeader title={t("comments.title")} />
            {c.description && <p className="whitespace-pre-wrap border-b border-border px-5 py-4 text-sm">{c.description}</p>}
            <CommentThread comments={c.comments} endpoint={`/cases/${id}/comments`} canPost={can(actor, "case:update")} />
          </Panel>
          <CaseExpenses caseId={id} clientId={c.client?.id ?? null} employeeId={c.employee?.id ?? null} actor={actor} />
        </div>
        <div className="card-grid">
          <Panel>
            <DetailList
              columns={1}
              items={[
                { label: t("cases.category"), value: categoryLabel(t, c.category) },
                { label: t("tasks.owner"), value: c.owner.name },
                { label: t("employees.client"), value: c.client ? <Link className="text-primary hover:underline" href={`/clients/${c.client.id}`}>{c.client.displayName}</Link> : "—" },
                { label: t("employees.employee"), value: c.employee ? <Link className="text-primary hover:underline" href={`/employees/${c.employee.id}`}>{locale === "ar" && c.employee.nameAr ? c.employee.nameAr : c.employee.nameEn}</Link> : "—" },
                { label: t("cases.source"), value: t(`enums.CaseSource.${c.source}`) },
                { label: t("cases.slaDue"), value: c.slaDueAt ? <span className={late ? "font-medium text-danger" : ""}>{formatDateTime(c.slaDueAt, locale)}</span> : "—" },
                { label: t("cases.firstResponse"), value: c.firstResponseAt ? formatDateTime(c.firstResponseAt, locale) : "—" },
                ...(c.closedAt ? [{ label: t("cases.closedAt"), value: formatDateTime(c.closedAt, locale) }] : []),
              ]}
            />
          </Panel>
          <Panel>
            <PanelHeader title={t("cases.history")} description={t("cases.historyHint")} />
            <ol>
              {c.events.map((e) => (
                <li key={e.id} className="border-b border-border px-5 py-2.5 text-sm last:border-0">
                  <p className="font-medium">{t(`enums.CaseStage.${e.toStage}`)}</p>
                  <p className="text-xs text-muted">{e.actor.name} · <span className="num">{formatDateTime(e.createdAt, locale)}</span></p>
                  {e.note && <p className="mt-1 whitespace-pre-wrap text-xs">{e.note}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
