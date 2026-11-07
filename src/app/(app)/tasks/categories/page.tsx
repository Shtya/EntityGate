import type { Metadata } from "next";
import { ArrowUpRight, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listCategories } from "@/server/modules/operations/categories";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Panel } from "@/components/ui/misc";
import { TaskFormButton } from "../task-form";
import { taskFormOptions } from "../form-options";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("taskCategories"))("title") };
}

export default async function TaskCategoriesPage() {
  const actor = await getActor();
  if (!can(actor, "task:read")) return <Forbidden />;
  const t = await getTranslations();
  const manage = can(actor, "task_category:manage");
  const create = can(actor, "task:create");
  const [all, formOptions] = await Promise.all([listCategories(), create ? taskFormOptions(t, actor) : null]);
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const nameField = [{ name: "name", label: t("taskCategories.name"), required: true, wide: true }];

  return (
    <>
      <PageHeader eyebrow={t("meta.tasks")} title={t("taskCategories.title")} description={t("taskCategories.description")} />
      {active.length === 0 && !manage ? (
        <Panel>
          <EmptyState title={t("taskCategories.emptyTitle")} description={t("taskCategories.emptyBody")} />
        </Panel>
      ) : (
        <ul className="grid gap-[var(--card-gap)] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {active.map((c) => (
            <li key={c.id} className="card group flex min-h-36 flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                  <Tag className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="text-start font-medium leading-snug">{c.name}</p>
                  <Link href={`/tasks?view=all&category=${c.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
                    <span className="num">{t("taskCategories.counts", { open: c.open, total: c.total })}</span>
                    <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                  </Link>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border pt-3">
                {create && formOptions && <TaskFormButton size="sm" variant="secondary" label={t("taskCategories.newTask")} title={t("tasks.add")} endpoint="/tasks" options={formOptions} initial={{ categoryIds: [c.id], title: "" }} />}
                {manage && (
                  <span className="ms-auto flex gap-1">
                    <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("taskCategories.rename")} endpoint={`/task-categories/${c.id}`} method="PUT" submitLabel={t("common.save")} initial={{ name: c.name }} fields={nameField} />
                    <ActionButton
                      variant="danger"
                      size="sm"
                      label={t("common.remove")}
                      endpoint={`/task-categories/${c.id}`}
                      method="DELETE"
                      confirm={t("taskCategories.removeTitle", { name: c.name })}
                      confirmBody={c.total ? t("taskCategories.removeUsed", { count: c.total }) : t("taskCategories.removeUnused")}
                      successMessage={t(c.total ? "taskCategories.archived" : "taskCategories.deleted")}
                    />
                  </span>
                )}
              </div>
            </li>
          ))}
          {manage && (
            <li>
              <AddCard label={t("taskCategories.add")} hint={t("taskCategories.addHint")}>
                <FormButton variant="ghost" label={t("taskCategories.add")} title={t("taskCategories.add")} endpoint="/task-categories" submitLabel={t("common.add")} successMessage={t("taskCategories.added")} fields={nameField} />
              </AddCard>
            </li>
          )}
        </ul>
      )}

      {manage && archived.length > 0 && (
        <section className="grid gap-2">
          <h2 className="eyebrow">{t("taskCategories.archivedTitle")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted">{c.name}</span>
                <span className="text-xs text-faint num">{t("taskCategories.taskCount", { count: c.total })}</span>
                <ActionButton variant="ghost" size="sm" label={t("taskCategories.restore")} endpoint={`/task-categories/${c.id}/restore`} successMessage={t("taskCategories.restored")} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The "+" card: the whole card is the add button's frame, with the form's own button inside. */
function AddCard({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="relative grid h-full min-h-36 place-items-center rounded-lg border-2 border-dashed border-border-strong p-4 text-center transition-colors hover:border-primary hover:bg-primary-soft/40 [&_button]:after:absolute [&_button]:after:inset-0 [&_button]:after:content-['']">
      <div className="grid justify-items-center gap-1.5">
        <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-primary">
          <Plus className="size-5" />
        </span>
        <span className="sr-only">{label}</span>
        {children}
        <span className="text-xs text-muted">{hint}</span>
      </div>
    </div>
  );
}
