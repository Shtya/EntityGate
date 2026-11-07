import type { Metadata } from "next";
import { Lock, Tags } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { categoryChoices } from "@/server/modules/operations/categories";
import { listTasksQuery, TASK_STATUSES } from "@/server/modules/operations/schema";
import { listTasks, taskStats } from "@/server/modules/operations/service";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Badge, Panel } from "@/components/ui/misc";
import { taskFormOptions } from "./form-options";
import { PRIORITY_TONE, TASK_TONE } from "./shared";
import { TaskFormButton } from "./task-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("tasks") };
}

const BOARD = ["TODO", "IN_PROGRESS", "BLOCKED", "WAITING_FINANCE", "DONE"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "task:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const raw = await searchParams;
  const q = listTasksQuery.parse(raw);
  const wide = can(actor, "task:read_all");
  const [{ rows, total, page, view }, stats, clients, users, categories, formOptions] = await Promise.all([
    listTasks(actor, q),
    taskStats(actor),
    clientOptions(),
    wide ? activeUserOptions() : [],
    categoryChoices(),
    can(actor, "task:create") ? taskFormOptions(t, actor) : null,
  ]);
  const now = new Date();
  const isOverdue = (r: (typeof rows)[number]) => !!r.dueAt && r.dueAt < now && ["TODO", "IN_PROGRESS", "BLOCKED"].includes(r.status);
  const keep = (extra: Record<string, string>) => `/tasks?${new URLSearchParams({ ...(q.layout === "board" ? { layout: "board" } : {}), ...extra })}`;

  const tabs = [
    { key: "mine", label: t("tasks.mine"), href: keep({ view: "mine" }) },
    { key: "onlyMe", label: t("tasks.onlyMeTab"), href: keep({ view: "onlyMe" }) },
    ...(wide ? [{ key: "team", label: t("tasks.team"), href: keep({ view: "team" }) }] : []),
    { key: "overdue", label: t("tasks.overdue"), href: keep({ view: "overdue" }) },
    { key: "finance", label: t("tasks.waitingFinance"), href: keep({ view: "finance" }) },
    ...(wide ? [{ key: "all", label: t("tasks.all"), href: keep({ view: "all" }) }] : []),
  ];
  const tiles = [
    { key: "total", value: stats.total, tone: "text-fg", href: keep({ view: wide ? "all" : "mine" }) },
    { key: "done", value: stats.done, tone: "text-success", href: keep({ view: wide ? "all" : "mine", status: "DONE" }) },
    { key: "inProgress", value: stats.inProgress, tone: "text-info", href: keep({ view: wide ? "all" : "mine", status: "IN_PROGRESS" }) },
    { key: "waitingFinance", value: stats.waitingFinance, tone: "text-accent", href: keep({ view: "finance" }) },
    { key: "notStarted", value: stats.notStarted, tone: "text-muted", href: keep({ view: wide ? "all" : "mine", status: "TODO" }) },
    { key: "onHold", value: stats.onHold, tone: "text-warning", href: keep({ view: wide ? "all" : "mine", status: "BLOCKED" }) },
    { key: "overdue", value: stats.overdue, tone: "text-danger", href: keep({ view: "overdue" }) },
  ];
  const chips = (r: (typeof rows)[number]) =>
    r.categories.length > 0 && (
      <span className="flex flex-wrap gap-1">
        {r.categories.map((c) => (
          <span key={c.category.id} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary" dir="auto">{c.category.name}</span>
        ))}
      </span>
    );
  const people = (r: (typeof rows)[number]) => (
    <dl className="grid gap-0.5 text-xs">
      <div className="flex gap-1.5"><dt className="text-faint">{t("tasks.ownerShort")}</dt><dd className="truncate font-medium">{r.owner.name}</dd></div>
      {r.hrRep && <div className="flex gap-1.5"><dt className="text-faint">{t("tasks.hrRepShort")}</dt><dd className="truncate">{r.hrRep.name}</dd></div>}
      {r.accountManager && <div className="flex gap-1.5"><dt className="text-faint">{t("tasks.amShort")}</dt><dd className="truncate">{r.accountManager.name}</dd></div>}
    </dl>
  );

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("tasks.title")}
        description={t("tasks.description")}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/tasks/categories"><Tags /> {t("taskCategories.title")}</Link>
            </Button>
            {formOptions && <TaskFormButton label={t("tasks.add")} title={t("tasks.add")} endpoint="/tasks" options={formOptions} />}
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-[var(--card-gap)] sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="card block px-4 py-3 transition-colors hover:bg-surface-2">
              <span className="block text-xs text-muted">{t(`tasks.stat_${s.key}`)}</span>
              <span className={cn("block text-2xl font-semibold leading-tight num", s.tone)}>{s.value}</span>
            </Link>
          </li>
        ))}
      </ul>

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

      <Panel>
        <FilterBar
          count={t("tasks.count", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("tasks.search") },
            ...(q.layout === "board" ? [] : [{ key: "status", type: "select" as const, label: t("common.status"), allLabel: t("tasks.anyStatus"), options: TASK_STATUSES.map((s) => ({ value: s, label: t(`enums.TaskStatus.${s}`) })) }]),
            { key: "category", type: "select", label: t("tasks.categories"), allLabel: t("tasks.allCategories"), options: categories.map((c) => ({ value: c.id, label: c.name })) },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
            ...(wide ? [{ key: "owner", type: "select" as const, label: t("tasks.owner"), allLabel: t("tasks.anyone"), options: users }] : []),
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="tasks" extra={{ view }} />}
        </FilterBar>

        {q.layout === "board" ? (
          <div className="scroll-thin grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto p-4">
            {BOARD.map((status) => {
              const items = rows.filter((r) => r.status === status);
              return (
                <section key={status} className="grid content-start gap-2 rounded-lg bg-surface-2 p-2">
                  <header className="flex items-center justify-between px-1.5 py-1">
                    <Badge tone={TASK_TONE[status]} dot>{t(`enums.TaskStatus.${status}`)}</Badge>
                    <span className="text-xs text-faint num">{items.length}</span>
                  </header>
                  {items.map((r) => (
                    <article key={r.id} className="card grid gap-2 p-3">
                      {chips(r)}
                      <Link href={`/tasks/${r.id}`} className="text-sm font-medium leading-snug hover:text-primary">{r.title}</Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge tone={PRIORITY_TONE[r.priority]}>{t(`enums.Priority.${r.priority}`)}</Badge>
                        {r.dueAt && <span className={cn("num", isOverdue(r) && "font-medium text-danger")}>{formatDate(r.dueAt, locale)}</span>}
                        {r.onlyMe && <Lock className="size-3" aria-label={t("tasks.onlyMe")} />}
                      </div>
                      {r.holdReason && <p className="rounded bg-warning-soft px-2 py-1 text-xs text-warning">{r.holdReason}</p>}
                      <p className="truncate text-xs text-faint">{r.owner.name}{r.client ? ` · ${r.client.displayName}` : ""}</p>
                      {can(actor, "task:update") && (status === "TODO" || status === "IN_PROGRESS") && (
                        <div className="flex gap-1">
                          {status === "TODO" && <ActionButton variant="ghost" label={t("tasks.start")} endpoint={`/tasks/${r.id}/status`} json={{ status: "IN_PROGRESS" }} />}
                          <ActionButton variant="ghost" label={t("tasks.done")} endpoint={`/tasks/${r.id}/status`} json={{ status: "DONE" }} />
                        </div>
                      )}
                    </article>
                  ))}
                  {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-faint">{t("tasks.nothing")}</p>}
                </section>
              );
            })}
          </div>
        ) : (
          <RecordTable
            rows={rows}
            rowKey={(r) => r.id}
            emptyTitle={t("tasks.emptyTitle")}
            emptyBody={t("tasks.emptyBody")}
            minWidth={900}
            footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
            columns={[
              {
                header: t("tasks.task"),
                cell: (r) => (
                  <span className="grid min-w-0 gap-1">
                    {chips(r)}
                    <Link href={`/tasks/${r.id}`} dir="auto" className="font-medium leading-snug hover:text-primary">
                      {r.onlyMe && <Lock className="me-1 inline size-3 align-[-1px] text-muted" aria-label={t("tasks.onlyMe")} />}
                      {r.title}
                    </Link>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <Code>{r.number}</Code>
                      <span>{r.client?.displayName ?? t(`enums.TaskKind.${r.kind}`)}</span>
                      {r.dueAt && <span className={cn("num", isOverdue(r) && "font-medium text-danger")}>{t("tasks.dueOn", { date: formatDate(r.dueAt, locale) })}</span>}
                      {isOverdue(r) && <Badge tone="danger">{t("tasks.overdueBadge")}</Badge>}
                    </span>
                    {r.holdReason && <span className="w-fit rounded bg-warning-soft px-2 py-0.5 text-xs text-warning">{t("tasks.reasonLabel", { reason: r.holdReason })}</span>}
                  </span>
                ),
              },
              { header: t("tasks.people"), hideOnMobile: true, cell: people },
              { header: t("tasks.priority"), cell: (r) => <Badge tone={PRIORITY_TONE[r.priority]}>{t(`enums.Priority.${r.priority}`)}</Badge> },
              { header: t("common.status"), cell: (r) => <Badge tone={TASK_TONE[r.status]} dot>{t(`enums.TaskStatus.${r.status}`)}</Badge> },
            ]}
          />
        )}
      </Panel>
      {raw.category && !categories.some((c) => c.id === raw.category) && <p className="text-xs text-muted">{t("tasks.archivedCategoryFilter")}</p>}
    </>
  );
}
