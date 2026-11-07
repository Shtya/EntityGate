import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { CLIENT_STATUSES, listClientsQuery } from "@/server/modules/clients/schema";
import { activeUserOptions, listClients } from "@/server/modules/clients/service";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";
import { CLIENT_STATUS_TONE, HEALTH_TONE, clientFields } from "./shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("clients") };
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "client:read")) return <Forbidden />;
  const t = await getTranslations();
  const q = listClientsQuery.parse(await searchParams);
  const [{ rows, total, page }, owners] = await Promise.all([listClients(q), activeUserOptions()]);

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("clients.title")}
        description={t("clients.description")}
        actions={
          can(actor, "client:create") && (
            <FormButton label={t("clients.add")} title={t("clients.add")} fields={clientFields(t)} endpoint="/clients" submitLabel={t("clients.add")} successMessage={t("clients.created")} redirectTo="/clients/{id}" />
          )
        }
      />
      <Panel>
        <FilterBar
          count={t("clients.count", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("clients.search") },
            { key: "status", type: "select", label: t("clients.filterStatus"), allLabel: t("clients.allStatuses"), options: CLIENT_STATUSES.map((s) => ({ value: s, label: t(`enums.ClientStatus.${s}`) })) },
            { key: "owner", type: "select", label: t("clients.filterOwner"), allLabel: t("clients.allOwners"), options: owners },
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="clients" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(c) => c.id}
          emptyTitle={t("clients.emptyTitle")}
          emptyBody={t("clients.emptyBody")}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          columns={[
            { header: t("clients.client"), cell: (c) => <RecordLink href={`/clients/${c.id}`} sub={<Code>{c.code}</Code>}>{c.displayName}</RecordLink> },
            { header: t("clients.owner"), cell: (c) => c.assignments[0]?.user.name ?? <span className="text-faint">{t("clients.noOwner")}</span>, hideOnMobile: true },
            { header: t("clients.headcount"), align: "end", cell: (c) => <span className="num">{c._count.allocations}</span> },
            { header: t("clients.openCases"), align: "end", hideOnMobile: true, cell: (c) => <span className="num">{c._count.cases}</span> },
            { header: t("clients.health"), cell: (c) => (c.health ? <Badge tone={HEALTH_TONE[c.health]} dot>{t(`enums.ClientHealth.${c.health}`)}</Badge> : <span className="text-faint">—</span>) },
            { header: t("common.status"), cell: (c) => <Badge tone={CLIENT_STATUS_TONE[c.status]}>{t(`enums.ClientStatus.${c.status}`)}</Badge> },
          ]}
        />
      </Panel>
    </>
  );
}
