import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { activeUserOptions } from "@/server/modules/clients/service";
import { getTask } from "@/server/modules/operations/service";
import { Lock } from "lucide-react";
import { formatDate, toDateOnly } from "@/lib/dates";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { CommentThread } from "@/components/patterns/comments";
import { PageHeader } from "@/components/patterns/page-header";
import { DetailList } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { PRIORITY_TONE, TASK_TONE } from "../shared";
import { taskFormOptions } from "../form-options";
import { TaskFormButton } from "../task-form";

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
  const open = ["TODO", "IN_PROGRESS", "BLOCKED"].includes(task.status);
  const formOptions = canEdit ? await taskFormOptions(t, actor) : null;
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
            {task.onlyMe && <Badge><Lock className="size-3" /> {t("tasks.onlyMe")}</Badge>}
            {task.categories.map((c) => <Badge key={c.category.id} tone="primary">{c.category.name}</Badge>)}
          </span>
        }
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              {open && task.status !== "IN_PROGRESS" && statusButton("IN_PROGRESS", t("tasks.start"))}
              {open && task.status !== "BLOCKED" && (
                <FormButton size="sm" variant="secondary" label={t("tasks.block")} title={t("tasks.block")} description={t("tasks.holdHint")} endpoint={`/tasks/${id}/status`} submitLabel={t("tasks.block")} hiddenValues={{ status: "BLOCKED" }} fields={[{ name: "reason", label: t("tasks.holdReason"), type: "textarea", required: true }]} />
              )}
              {task.status === "WAITING_FINANCE" && can(actor, "payment:record") && <ActionButton variant="primary" label={t("tasks.confirmPayment")} endpoint={`/tasks/${id}/finance`} confirm={t("tasks.confirmPaymentTitle")} confirmBody={t("tasks.confirmPaymentBody")} />}
              {formOptions && (
                <TaskFormButton
                  size="sm"
                  variant="secondary"
                  icon={false}
                  label={t("common.edit")}
                  title={t("tasks.edit")}
                  endpoint={`/tasks/${id}`}
                  method="PUT"
                  options={{ ...formOptions, categories: [...formOptions.categories, ...task.categories.map((c) => c.category).filter((c) => !formOptions.categories.some((x) => x.id === c.id))] }}
                  initial={{
                    type: task.kind,
                    categoryIds: task.categories.map((c) => c.category.id),
                    title: task.title,
                    description: task.description ?? "",
                    clientId: task.clientId ?? "",
                    employeeIds: task.employees.map((e) => e.employee.id),
                    ownerId: task.ownerId,
                    onlyMe: task.onlyMe,
                    hrRepId: task.hrRepId ?? "",
                    accountManagerId: task.accountManagerId ?? "",
                    clientEmail: task.clientEmail ?? "",
                    priority: task.priority,
                    dueAt: task.dueAt ? toDateOnly(task.dueAt) : "",
                    recurrence: task.recurrenceRule ?? "NONE",
                    financeRequired: task.financeRequired,
                  }}
                />
              )}
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
          {task.holdReason && task.status === "BLOCKED" && <p className="border-b border-border bg-warning-soft px-5 py-3 text-sm text-warning">{t("tasks.reasonLabel", { reason: task.holdReason })}</p>}
          {task.description && <p className="whitespace-pre-wrap border-b border-border px-5 py-4 text-sm">{task.description}</p>}
          <CommentThread comments={task.comments} endpoint={`/tasks/${id}/comments`} canPost={canEdit} />
        </Panel>
        <Panel>
          <DetailList
            columns={1}
            items={[
              { label: t("tasks.owner"), value: task.owner.name },
              ...(task.hrRep ? [{ label: t("tasks.hrRep"), value: task.hrRep.name }] : []),
              ...(task.accountManager ? [{ label: t("tasks.accountManager"), value: task.accountManager.name }] : []),
              { label: t("tasks.type"), value: t(`enums.TaskKind.${task.kind}`) },
              { label: t("tasks.due"), value: task.dueAt ? formatDate(task.dueAt, locale) : "—" },
              { label: t("employees.client"), value: task.client ? <Link className="text-primary hover:underline" href={`/clients/${task.client.id}`}>{task.client.displayName}</Link> : t("tasks.internal") },
              ...(task.employees.length
                ? [{ label: t("tasks.employees"), value: <span className="grid gap-0.5">{task.employees.map(({ employee: e }) => <Link key={e.id} className="text-primary hover:underline" href={`/employees/${e.id}`}>{(locale === "ar" && e.nameAr) || e.nameEn}</Link>)}</span> }]
                : []),
              ...(task.clientEmail ? [{ label: t("tasks.clientEmail"), value: <bdi dir="ltr">{task.clientEmail}</bdi> }] : []),
              ...(task.financeRequired ? [{ label: t("tasks.financeRequired"), value: task.financeClearedAt ? t("tasks.financeCleared", { date: formatDate(task.financeClearedAt, locale) }) : t("tasks.financePending") }] : []),
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
