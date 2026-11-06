import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { masterData } from "@/server/modules/master-data/service";
import { formatDate } from "@/lib/dates";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton, type FieldSpec } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordTable } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { categoryLabel } from "../../cases/shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("masterData") };
}

const tabs = ["sponsors", "locations", "caseCategories", "expenseCategories", "holidays"] as const;
const query = z.object({ tab: z.enum(tabs).catch("sponsors").default("sponsors") });

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "master_data:manage")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const { tab } = query.parse(await searchParams);
  const data = await masterData();
  const active = (on: boolean) => <Badge tone={on ? "success" : "neutral"} dot>{t(on ? "master.active" : "master.inactive")}</Badge>;

  const sponsorFields: FieldSpec[] = [
    { name: "name", label: t("master.name"), required: true, wide: true },
    { name: "type", label: t("finance.kind"), type: "select", required: true, options: (["OWN", "THIRD_PARTY"] as const).map((k) => ({ value: k, label: t(`enums.SponsorType.${k}`) })) },
    { name: "crNumber", label: t("master.cr"), ltr: true },
  ];
  const caseFields: FieldSpec[] = [
    { name: "name", label: t("master.name"), required: true, wide: true },
    { name: "code", label: t("master.code"), required: true, ltr: true, hint: t("master.codeHint") },
    { name: "defaultSeverity", label: t("reports.severity"), type: "select", required: true, options: (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((k) => ({ value: k, label: t(`enums.Severity.${k}`) })) },
    { name: "slaHours", label: t("master.slaHours"), type: "number" },
    { name: "firstResponseHours", label: t("master.firstResponse"), type: "number" },
    { name: "active", label: t("master.active"), type: "checkbox" },
  ];
  const expenseFields: FieldSpec[] = [
    { name: "name", label: t("master.name"), required: true, wide: true },
    { name: "code", label: t("master.code"), required: true, ltr: true, hint: t("master.codeHint") },
    { name: "kind", label: t("finance.kind"), type: "select", required: true, options: (["DIRECT", "OVERHEAD"] as const).map((k) => ({ value: k, label: t(`enums.ExpenseKind.${k}`) })) },
    { name: "recoverableDefault", label: t("master.recoverableDefault"), type: "checkbox" },
    { name: "active", label: t("master.active"), type: "checkbox" },
  ];
  const expenseLabel = (c: { code: string; name: string }) => (t.has(`enums.ExpenseCategory.${c.code}`) ? t(`enums.ExpenseCategory.${c.code}`) : c.name);

  return (
    <>
      <PageHeader eyebrow={t("nav.system")} title={t("nav.masterData")} description={t("master.description")} />
      <PageTabs active={tab} tabs={tabs.map((k) => ({ key: k, label: t(`master.tab_${k}`), href: `/admin/master-data?tab=${k}` }))} />

      {tab === "sponsors" && (
        <Panel>
          <PanelHeader title={t("master.tab_sponsors")} actions={<FormButton size="sm" label={t("master.add")} title={t("master.tab_sponsors")} endpoint="/master-data/sponsors" submitLabel={t("common.add")} fields={sponsorFields} />} />
          <RecordTable
            rows={data.sponsors}
            rowKey={(s) => s.id}
            emptyTitle={t("master.empty")}
            columns={[
              { header: t("master.name"), cell: (s) => <span className="font-medium">{s.name}</span> },
              { header: t("finance.kind"), cell: (s) => t(`enums.SponsorType.${s.type}`) },
              { header: t("master.cr"), hideOnMobile: true, cell: (s) => (s.crNumber ? <Code>{s.crNumber}</Code> : "—") },
              { header: t("overview.headcount"), align: "end", cell: (s) => <span className="num">{s._count.employees}</span> },
              { header: "", align: "end", cell: (s) => <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("common.edit")} endpoint={`/master-data/sponsors/${s.id}`} method="PUT" submitLabel={t("common.save")} initial={{ name: s.name, type: s.type, crNumber: s.crNumber }} fields={sponsorFields} /> },
            ]}
          />
        </Panel>
      )}

      {tab === "locations" && (
        <div className="card-grid items-start lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel>
            <PanelHeader title={t("master.tab_locations")} actions={<FormButton size="sm" label={t("master.add")} title={t("master.tab_locations")} endpoint="/master-data/locations" submitLabel={t("common.add")} fields={[{ name: "name", label: t("master.name"), required: true, wide: true }, { name: "city", label: t("master.city") }, { name: "regionId", label: t("overview.region"), type: "select", required: true, options: data.regions.map((r) => ({ value: r.id, label: r.name })) }]} />} />
            <RecordTable
              rows={data.locations}
              rowKey={(l) => l.id}
              emptyTitle={t("master.empty")}
              columns={[
                { header: t("master.name"), cell: (l) => <span className="font-medium">{l.name}</span> },
                { header: t("master.city"), cell: (l) => l.city ?? "—" },
                { header: t("overview.region"), cell: (l) => l.region.name },
                { header: "", align: "end", cell: (l) => <ActionButton variant="ghost" label={t("master.archive")} endpoint={`/master-data/locations/${l.id}`} method="DELETE" confirm={t("master.archiveConfirm")} /> },
              ]}
            />
          </Panel>
          <Panel>
            <PanelHeader title={t("overview.region")} actions={<FormButton size="sm" variant="secondary" label={t("master.add")} title={t("overview.region")} endpoint="/master-data/regions" submitLabel={t("common.add")} fields={[{ name: "name", label: t("master.name"), required: true, wide: true }, { name: "code", label: t("master.code"), required: true, ltr: true, wide: true, hint: t("master.codeHint") }]} />} />
            <ul className="px-5 pb-4 text-sm">{data.regions.map((r) => <li key={r.id} className="flex justify-between border-b border-border py-2 last:border-0"><span>{r.name}</span><Code>{r.code}</Code></li>)}</ul>
          </Panel>
        </div>
      )}

      {tab === "caseCategories" && (
        <Panel>
          <PanelHeader title={t("master.tab_caseCategories")} description={t("master.caseHint")} actions={<FormButton size="sm" label={t("master.add")} title={t("master.tab_caseCategories")} endpoint="/master-data/case-categories" submitLabel={t("common.add")} initial={{ active: true, defaultSeverity: "MEDIUM" }} fields={caseFields} wide />} />
          <RecordTable
            rows={data.caseCategories}
            rowKey={(c) => c.id}
            emptyTitle={t("master.empty")}
            minWidth={640}
            columns={[
              { header: t("master.name"), cell: (c) => <span className="font-medium">{categoryLabel(t, c)}</span> },
              { header: t("reports.severity"), cell: (c) => t(`enums.Severity.${c.defaultSeverity}`) },
              { header: t("master.slaHours"), align: "end", cell: (c) => <span className="num">{c.slaHours ?? "—"}</span> },
              { header: t("master.firstResponse"), align: "end", cell: (c) => <span className="num">{c.firstResponseHours ?? "—"}</span> },
              { header: t("common.status"), cell: (c) => active(c.active) },
              { header: "", align: "end", cell: (c) => <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("common.edit")} endpoint={`/master-data/case-categories/${c.id}`} method="PUT" submitLabel={t("common.save")} initial={{ name: c.name, code: c.code, defaultSeverity: c.defaultSeverity, slaHours: c.slaHours === null ? null : String(c.slaHours), firstResponseHours: c.firstResponseHours === null ? null : String(c.firstResponseHours), active: c.active }} fields={caseFields} wide /> },
            ]}
          />
        </Panel>
      )}

      {tab === "expenseCategories" && (
        <Panel>
          <PanelHeader title={t("master.tab_expenseCategories")} actions={<FormButton size="sm" label={t("master.add")} title={t("master.tab_expenseCategories")} endpoint="/master-data/expense-categories" submitLabel={t("common.add")} initial={{ active: true }} fields={expenseFields} />} />
          <RecordTable
            rows={data.expenseCategories}
            rowKey={(c) => c.id}
            emptyTitle={t("master.empty")}
            columns={[
              { header: t("master.name"), cell: (c) => <span className="font-medium">{expenseLabel(c)}</span> },
              { header: t("finance.kind"), cell: (c) => t(`enums.ExpenseKind.${c.kind}`) },
              { header: t("master.recoverableDefault"), cell: (c) => t(c.recoverableDefault ? "common.yes" : "common.no") },
              { header: t("common.status"), cell: (c) => active(c.active) },
              { header: "", align: "end", cell: (c) => <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("common.edit")} endpoint={`/master-data/expense-categories/${c.id}`} method="PUT" submitLabel={t("common.save")} initial={{ name: c.name, code: c.code, kind: c.kind, recoverableDefault: c.recoverableDefault, active: c.active }} fields={expenseFields} /> },
            ]}
          />
        </Panel>
      )}

      {tab === "holidays" && (
        <Panel>
          <PanelHeader title={t("master.tab_holidays")} description={t("master.holidayHint")} actions={<FormButton size="sm" label={t("master.add")} title={t("master.tab_holidays")} endpoint="/master-data/holidays" submitLabel={t("common.add")} fields={[{ name: "date", label: t("finance.incurredAt"), type: "date", required: true, wide: true }, { name: "name", label: t("master.name"), required: true, wide: true }]} />} />
          <RecordTable
            rows={data.holidays}
            rowKey={(h) => h.id}
            emptyTitle={t("master.noHolidays")}
            columns={[
              { header: t("finance.incurredAt"), nowrap: true, cell: (h) => formatDate(h.date, locale) },
              { header: t("master.name"), cell: (h) => h.name },
              { header: "", align: "end", cell: (h) => <ActionButton variant="ghost" label={t("common.remove")} endpoint={`/master-data/holidays/${h.id}`} method="DELETE" /> },
            ]}
          />
        </Panel>
      )}
    </>
  );
}
