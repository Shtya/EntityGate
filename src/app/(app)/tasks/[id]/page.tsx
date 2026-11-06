import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { activeUserOptions } from "@/server/modules/clients/service";
import { getTask } from "@/server/modules/operations/service";
import { formatDate } from "@/lib/dates";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { CommentThread } from "@/components/patterns/comments";
import { PageHeader } from "@/components/patterns/page-header";
import { DetailList } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { PRIORITY_TONE, TASK_TONE } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("tasks") };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!can(actor, "task:read")) return <Forbidden />;
  const { id } = await params;
  let task;
  try {
    task = await getTask(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return <Forbidden />;
    throw e;
  }
  const t = await getTranslations();
  const locale = await getLocale();
  const canEdit = can(actor, "task:update");
  const open = !["DONE", "CANCELLED"].includes(task.status);
  const statusButton = (status: string, label: string, variant: "primary" | "secondary" | "ghost" = "secondary") => <ActionButton variant={variant} label={label} endpoint={`/tasks/${id}/status`} json={{ status }} />;

  return (
    <>
      <PageHeader
        eyebrow={task.number}
        title={task.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={TASK_TONE[task.status]} dot>{t(`enums.TaskStatus.${task.status}`)}</Badge>
            <Badge tone={PRIORITY_TONE[task.priority]}>{t(`enums.Priority.${task.priority}`)}</Badge>
            {task.recurrenceRule && <Badge>{t(`enums.Recurrence.${task.recurrenceRule}`)}</Badge>}
          </span>
        }
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              {open && task.status !== "IN_PROGRESS" && statusButton("IN_PROGRESS", t("tasks.start"))}
              {open && task.status !== "BLOCKED" && statusButton("BLOCKED", t("tasks.block"))}
              {open && statusButton("DONE", t("tasks.done"), "primary")}
              {!open && statusButton("TODO", t("tasks.reopen"))}
              {open && <FormButton size="sm" variant="secondary" label={t("tasks.reassign")} title={t("tasks.reassign")} endpoint={`/tasks/${id}/reassign`} submitLabel={t("tasks.reassign")} initial={{ ownerId: task.owner.id }} fields={[{ name: "ownerId", label: t("tasks.owner"), type: "select", required: true, wide: true, options: await activeUserOptions() }]} />}
            </div>
          )
        }
      />
      <div className="card-grid items-start lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <PanelHeader title={t("comments.title")} description={t("tasks.commentsHint")} />
          {task.description && <p className="whitespace-pre-wrap border-b border-border px-5 py-4 text-sm">{task.description}</p>}
          <CommentThread comments={task.comments} endpoint={`/tasks/${id}/comments`} canPost={canEdit} />
        </Panel>
        <Panel>
          <DetailList
            columns={1}
            items={[
              { label: t("tasks.owner"), value: task.owner.name },
              { label: t("tasks.due"), value: task.dueAt ? formatDate(task.dueAt, locale) : "—" },
              { label: t("employees.client"), value: task.client ? <Link className="text-primary hover:underline" href={`/clients/${task.client.id}`}>{task.client.displayName}</Link> : t("tasks.internal") },
              ...(task.case ? [{ label: t("cases.case"), value: <Link className="text-primary hover:underline" href={`/cases/${task.case.id}`}>{task.case.number}</Link> }] : []),
              { label: t("tasks.createdBy"), value: task.createdBy.name },
              { label: t("users.createdAt"), value: formatDate(task.createdAt, locale) },
              ...(task.completedAt ? [{ label: t("tasks.completedAt"), value: formatDate(task.completedAt, locale) }] : []),
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
