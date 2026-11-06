import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { listTasksQuery, TASK_STATUSES } from "@/server/modules/operations/schema";
import { listTasks } from "@/server/modules/operations/service";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { PRIORITY_TONE, TASK_TONE, taskFields } from "./shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("tasks") };
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "task:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listTasksQuery.parse(await searchParams);
  const [{ rows, total, page, view }, clients, users] = await Promise.all([listTasks(actor, q), clientOptions(), activeUserOptions()]);
  const now = new Date();
  const wide = can(actor, "task:read_all");
  const isOverdue = (r: (typeof rows)[number]) => !!r.dueAt && r.dueAt < now && !["DONE", "CANCELLED"].includes(r.status);
  const base = (v: string, layout = q.layout) => `/tasks?view=${v}${layout === "board" ? "&layout=board" : ""}`;

  const tabs = [
    { key: "mine", label: t("tasks.mine"), href: base("mine") },
    ...(wide ? [{ key: "team", label: t("tasks.team"), href: base("team") }] : []),
    { key: "overdue", label: t("tasks.overdue"), href: base("overdue") },
    ...(wide ? [{ key: "all", label: t("tasks.all"), href: base("all") }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("tasks.title")}
        description={t("tasks.description")}
        actions={
          can(actor, "task:create") && (
            <FormButton wide label={t("tasks.add")} title={t("tasks.add")} endpoint="/tasks" submitLabel={t("tasks.add")} initial={{ ownerId: actor.id, priority: "MEDIUM", recurrence: "NONE" }} fields={taskFields(t, users, clients)} />
          )
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTabs tabs={tabs} active={view} />
        <PageTabs
          active={q.layout}
          tabs={[
            { key: "list", label: t("tasks.list"), href: `/tasks?view=${view}` },
            { key: "board", label: t("tasks.board"), href: `/tasks?view=${view}&layout=board` },
          ]}
        />
      </div>

      {q.layout === "board" ? (
        <div className="grid items-start gap-[var(--card-gap)] md:grid-cols-2 xl:grid-cols-4">
          {(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const).map((status) => {
            const items = rows.filter((r) => r.status === status);
            return (
              <Panel key={status}>
                <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="text-sm font-semibold">{t(`enums.TaskStatus.${status}`)}</span>
                  <span className="text-xs text-faint num">{items.length}</span>
                </header>
                <ul className="grid gap-px">
                  {items.map((r) => (
                    <li key={r.id} className="grid gap-1.5 border-b border-border px-4 py-3 last:border-0">
                      <Link href={`/tasks/${r.id}`} className="text-sm font-medium hover:text-primary hover:underline">{r.title}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge tone={PRIORITY_TONE[r.priority]}>{t(`enums.Priority.${r.priority}`)}</Badge>
                        {r.dueAt && <span className={cn("num", isOverdue(r) && "font-medium text-danger")}>{formatDate(r.dueAt, locale)}</span>}
                      </div>
                      <p className="truncate text-xs text-faint">{r.owner.name}{r.client ? ` · ${r.client.displayName}` : ""}</p>
                      {can(actor, "task:update") && status !== "DONE" && (
                        <div className="flex gap-1">
                          {status !== "IN_PROGRESS" && <ActionButton variant="ghost" label={t("tasks.start")} endpoint={`/tasks/${r.id}/status`} json={{ status: "IN_PROGRESS" }} />}
                          <ActionButton variant="ghost" label={t("tasks.done")} endpoint={`/tasks/${r.id}/status`} json={{ status: "DONE" }} />
                        </div>
                      )}
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-4 py-6 text-center text-xs text-faint">{t("tasks.nothing")}</li>}
                </ul>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel>
          <FilterBar
            count={t("tasks.count", { count: total })}
            filters={[
              { key: "q", type: "search", label: t("tasks.search") },
              { key: "status", type: "select", label: t("common.status"), allLabel: t("tasks.openOnly"), options: TASK_STATUSES.map((s) => ({ value: s, label: t(`enums.TaskStatus.${s}`) })) },
              { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
            ]}
          />
          <RecordTable
            rows={rows}
            rowKey={(r) => r.id}
            emptyTitle={t("tasks.emptyTitle")}
            emptyBody={t("tasks.emptyBody")}
            minWidth={760}
            footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
            columns={[
              { header: t("tasks.task"), cell: (r) => <RecordLink href={`/tasks/${r.id}`} sub={<Code>{r.number}</Code>}>{r.title}</RecordLink> },
              { header: t("employees.client"), hideOnMobile: true, cell: (r) => r.client?.displayName ?? <span className="text-faint">{t("tasks.internal")}</span> },
              { header: t("tasks.owner"), hideOnMobile: true, cell: (r) => r.owner.name },
              { header: t("tasks.due"), nowrap: true, cell: (r) => (r.dueAt ? <span className={cn("num", isOverdue(r) && "font-medium text-danger")}>{formatDate(r.dueAt, locale)}</span> : <span className="text-faint">—</span>) },
              { header: t("tasks.priority"), cell: (r) => <Badge tone={PRIORITY_TONE[r.priority]}>{t(`enums.Priority.${r.priority}`)}</Badge> },
              { header: t("common.status"), cell: (r) => <Badge tone={TASK_TONE[r.status]} dot>{t(`enums.TaskStatus.${r.status}`)}</Badge> },
            ]}
          />
        </Panel>
      )}
    </>
  );
}
