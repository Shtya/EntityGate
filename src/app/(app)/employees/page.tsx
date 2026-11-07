import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor, getClientScope } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { PAGE_SIZE } from "@/server/validation";
import { clientOptions } from "@/server/modules/clients/service";
import { CLASSIFICATIONS, EMPLOYEE_STATUSES, listEmployeesQuery } from "@/server/modules/employees/schema";
import { employeeStats, listEmployees, sponsorOptions } from "@/server/modules/employees/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { daysUntil } from "@/lib/workforce";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { ExportButton } from "@/components/patterns/export-button";
import { FilterBar, ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, RecordLink, RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Badge, Panel, StatTile } from "@/components/ui/misc";
import { employeeFields, EMPLOYEE_STATUS_TONE } from "./shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("employees") };
}

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  if (!can(actor, "employee:read")) return <Forbidden />;
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listEmployeesQuery.parse(await searchParams);
  const scope = await getClientScope();
  const [{ rows, total, page }, stats, clients, sponsors] = await Promise.all([listEmployees(q), employeeStats(), clientOptions(), sponsorOptions()]);
  const today = todayDate();

  return (
    <>
      <PageHeader
        eyebrow={t("clients.eyebrow")}
        title={t("employees.title")}
        description={t("employees.description")}
        actions={
          <>
            {can(actor, "employee:import") && (
              <Button asChild variant="secondary">
                <Link href="/employees/import">{t("employees.import")}</Link>
              </Button>
            )}
            {can(actor, "employee:create") && (
              <FormButton
                wide
                label={t("employees.add")}
                title={t("employees.add")}
                description={t("employees.addHint")}
                endpoint="/employees"
                submitLabel={t("employees.add")}
                redirectTo="/employees/{id}"
                initial={{ classification: "SPONSORED", effectiveFrom: toDateOnly(today) }}
                fields={[
                  ...employeeFields(t, sponsors, true),
                  { name: "clientId", label: t("employees.client"), type: "select", options: clients, required: scope.kind !== "all" },
                  { name: "effectiveFrom", label: t("employees.startOnClient"), type: "date" },
                ]}
              />
            )}
          </>
        }
      />
      <div className="card-grid grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<UserCheck />} label={t("enums.EmployeeStatus.ACTIVE")} value={stats.active} />
        <StatTile icon={<UserPlus />} label={t("enums.EmployeeStatus.ONBOARDING")} value={stats.onboarding} />
        <StatTile icon={<UserMinus />} label={t("enums.EmployeeStatus.OFFBOARDING")} value={stats.offboarding} />
        <StatTile icon={<AlertTriangle />} label={t("employees.expiring60")} value={<Link href="/employees?attention=expiring" className="hover:text-primary">{stats.expiring}</Link>} />
      </div>
      <Panel>
        <FilterBar
          count={t("employees.count", { count: total })}
          filters={[
            { key: "q", type: "search", label: t("employees.search") },
            { key: "status", type: "select", label: t("common.status"), allLabel: t("clients.allStatuses"), options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: t(`enums.EmployeeStatus.${s}`) })) },
            { key: "classification", type: "select", label: t("employees.classification"), allLabel: t("employees.allClassifications"), options: CLASSIFICATIONS.map((s) => ({ value: s, label: t(`enums.WorkerClassification.${s}`) })) },
            { key: "client", type: "select", label: t("employees.client"), allLabel: t("employees.allClients"), options: clients },
            { key: "sponsor", type: "select", label: t("employees.sponsor"), allLabel: t("employees.allSponsors"), options: sponsors },
          ]}
        >
          {can(actor, "report:export") && <ExportButton list="employees" />}
        </FilterBar>
        <RecordTable
          rows={rows}
          rowKey={(e) => e.id}
          emptyTitle={t("employees.emptyTitle")}
          emptyBody={t("employees.emptyBody")}
          footer={total > PAGE_SIZE ? <ListPager page={page} pageSize={PAGE_SIZE} total={total} /> : undefined}
          minWidth={820}
          columns={[
            { header: t("employees.employee"), cell: (e) => <RecordLink href={`/employees/${e.id}`} sub={<Code>{e.employeeNo}</Code>}>{locale === "ar" && e.nameAr ? e.nameAr : e.nameEn}</RecordLink> },
            { header: t("employees.client"), cell: (e) => e.allocations[0]?.client.displayName ?? <span className="text-faint">{t("employees.unallocated")}</span> },
            { header: t("employees.sponsor"), hideOnMobile: true, cell: (e) => e.sponsor?.name ?? "—" },
            { header: t("employees.classification"), hideOnMobile: true, cell: (e) => t(`enums.WorkerClassification.${e.classification}`) },
            { header: t("common.status"), cell: (e) => <Badge tone={EMPLOYEE_STATUS_TONE[e.status]} dot>{t(`enums.EmployeeStatus.${e.status}`)}</Badge> },
            {
              header: t("employees.nextExpiry"),
              nowrap: true,
              cell: (e) => {
                if (!e.nextExpiry) return <span className="text-faint">—</span>;
                const days = daysUntil(e.nextExpiry.expiryDate, today);
                return (
                  <span title={formatDate(e.nextExpiry.expiryDate, locale)}>
                    <span className="text-muted">{t(`enums.DocumentType.${e.nextExpiry.type}`)} · </span>
                    <span className={days < 0 ? "font-medium text-danger" : days <= 60 ? "font-medium text-warning" : "num"}>{days < 0 ? t("employees.expiredDays", { days: -days }) : t("employees.inDays", { days })}</span>
                  </span>
                );
              },
            },
          ]}
        />
      </Panel>
    </>
  );
}
