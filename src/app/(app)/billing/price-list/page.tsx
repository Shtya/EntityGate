import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { listServices, listServicesQuery, SERVICE_UNITS } from "@/server/modules/price-list/service";
import { formatMoney } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ExportButton } from "@/components/patterns/export-button";
import { FormButton, type FieldSpec } from "@/components/patterns/form-dialog";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, PageTabs, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("priceList") };
}

export default async function PriceListPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "invoice:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listServicesQuery.parse(await searchParams);
  const { rows, total, page } = await listServices(q);
  const manage = can(actor, "price_list:manage");
  const fields: FieldSpec[] = [
    { name: "nameEn", label: t("priceList.nameEn"), required: true, wide: true },
    { name: "nameAr", label: t("priceList.nameAr"), wide: true },
    { name: "price", label: t("priceList.price"), type: "money", required: true, hint: t("priceList.priceHint") },
    { name: "unit", label: t("priceList.unit"), type: "select", required: true, options: SERVICE_UNITS.map((u) => ({ value: u, label: t(`enums.ServiceUnit.${u}`) })) },
    { name: "code", label: t("master.code"), required: true, ltr: true, hint: t("master.codeHint") },
    { name: "active", label: t("master.active"), type: "checkbox" },
    { name: "notes", label: t("common.notes"), type: "textarea" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t("nav.money")}
        title={t("nav.priceList")}
        description={t("priceList.description")}
        actions={manage && <FormButton label={t("priceList.add")} title={t("priceList.add")} endpoint="/price-list" submitLabel={t("common.add")} initial={{ unit: "PER_REQUEST", active: true }} fields={fields} wide />}
      />
      <PageTabs
        active={q.status}
        tabs={(["active", "inactive", "all"] as const).map((s) => ({ key: s, label: t(`priceList.view_${s}`), href: `/billing/price-list?status=${s}` }))}
      />
      <Panel>
        <FilterBar count={t("priceList.count", { count: total })} filters={[{ key: "q", type: "search", label: t("priceList.search") }]}>
          {can(actor, "report:export") && <ExportButton list="price-list" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(s) => s.id}
          emptyTitle={t("priceList.emptyTitle")}
          emptyBody={t(manage ? "priceList.emptyBody" : "priceList.emptyBodyReadOnly")}
          minWidth={640}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("priceList.service"), cell: (s) => <span><span className="block font-medium">{(locale === "ar" && s.nameAr) || s.nameEn}</span><span className="block text-xs text-muted"><Code>{s.code}</Code>{s.notes && ` · ${s.notes}`}</span></span> },
            { header: t("priceList.unit"), cell: (s) => t(`enums.ServiceUnit.${s.unit}`) },
            { header: t("priceList.price"), align: "end", nowrap: true, cell: (s) => <span className="font-medium">{formatMoney(s.price.toString(), { locale })}</span> },
            { header: t("common.status"), cell: (s) => <Badge tone={s.active ? "success" : "neutral"} dot>{t(s.active ? "master.active" : "master.inactive")}</Badge> },
            ...(manage
              ? [{
                  header: "",
                  align: "end" as const,
                  cell: (s: (typeof rows)[number]) => (
                    <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("common.edit")} endpoint={`/price-list/${s.id}`} method="PUT" submitLabel={t("common.save")} initial={{ code: s.code, nameEn: s.nameEn, nameAr: s.nameAr, unit: s.unit, price: s.price.toFixed(2), notes: s.notes, active: s.active }} fields={fields} wide />
                  ),
                }]
              : []),
          ]}
        />
      </Panel>
    </>
  );
}
