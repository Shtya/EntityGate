import type { Metadata } from "next";
import { AlarmClock, Clock, FolderOpen } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { CASE_STAGES, listCasesQuery } from "@/server/modules/operations/schema";
import { categoryOptions, listCases } from "@/server/modules/operations/service";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel, StatTile } from "@/components/ui/misc";
import { caseFields, categoryLabel, SEVERITY_TONE, STAGE_TONE } from "./shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("cases") };
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "case:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listCasesQuery.parse(await searchParams);
  const [{ rows, total, page, counts }, clients, users, categories] = await Promise.all([listCases(actor, q), clientOptions(), activeUserOptions(), categoryOptions()]);
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("cases.title")}
        description={t("cases.description")}
        actions={can(actor, "case:create") && <FormButton wide label={t("cases.add")} title={t("cases.add")} endpoint="/cases" submitLabel={t("cases.add")} redirectTo="/cases/{id}" initial={{ ownerId: actor.id, source: "INTERNAL" }} fields={caseFields(t, users, clients, categories)} />}
      />
      <div className="card-grid grid-cols-1 sm:grid-cols-3">
        <StatTile icon={<FolderOpen />} label={t("cases.open")} value={counts.total} />
        <StatTile icon={<Clock />} label={t("cases.dueToday")} value={counts.dueToday} />
        <StatTile icon={<AlarmClock />} label={t("cases.overdue")} value={counts.overdue} />
      </div>
      <PageTabs
        active={q.view}
        tabs={(["open", "overdue", "mine", "all"] as const).map((v) => ({ key: v, label: t(`cases.view_${v}`), href: `/cases?view=${v}` }))}
      />
      <Panel>
        <FilterBar
          count={t("cases.count", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("cases.search") },
            { key: "stage", type: "select", label: t("cases.stage"), allLabel: t("cases.allStages"), options: CASE_STAGES.map((s) => ({ value: s, label: t(`enums.CaseStage.${s}`) })) },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
            { key: "category", type: "select", label: t("cases.category"), allLabel: t("cases.allCategories"), options: categories.map((c) => ({ value: c.id, label: categoryLabel(t, c) })) },
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="cases" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(c) => c.id}
          emptyTitle={t("cases.emptyTitle")}
          emptyBody={t("cases.emptyBody")}
          minWidth={840}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("cases.case"), cell: (c) => <RecordLink href={`/cases/${c.id}`} sub={<><Code>{c.number}</Code> · {categoryLabel(t, c.category)}</>}>{c.title}</RecordLink> },
            { header: t("employees.client"), hideOnMobile: true, cell: (c) => c.client?.displayName ?? (c.employee ? (locale === "ar" && c.employee.nameAr ? c.employee.nameAr : c.employee.nameEn) : "—") },
            { header: t("tasks.owner"), hideOnMobile: true, cell: (c) => c.owner.name },
            { header: t("cases.stage"), cell: (c) => <Badge tone={STAGE_TONE[c.stage]}>{t(`enums.CaseStage.${c.stage}`)}</Badge> },
            { header: t("cases.severity"), cell: (c) => <Badge tone={SEVERITY_TONE[c.severity]}>{t(`enums.Severity.${c.severity}`)}</Badge> },
            {
              header: t("tasks.due"),
              nowrap: true,
              cell: (c) => {
                if (!c.slaDueAt) return <span className="text-faint">—</span>;
                const late = c.stage !== "CLOSED" && c.slaDueAt < now;
                return <span className={cn("num", late && "font-medium text-danger")}>{formatDate(c.slaDueAt, locale)}</span>;
              },
            },
          ]}
        />
      </Panel>
    </>
  );
}
