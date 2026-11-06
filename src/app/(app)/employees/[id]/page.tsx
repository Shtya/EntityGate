import type { Metadata } from "next";
import { Check, FileText } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { plain } from "@/server/util";
import { clientOptions, activeUserOptions } from "@/server/modules/clients/service";
import { getEmployee, locationOptions, sponsorOptions } from "@/server/modules/employees/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { add as sum, formatMoney } from "@/lib/money";
import { daysUntil, documentStatus, missingDocuments } from "@/lib/workforce";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, DetailList, PageTabs, RecordTable } from "@/components/patterns/record";
import { EmptyState } from "@/components/patterns/states";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { DOC_TONE, EMPLOYEE_STATUS_TONE, documentFields, employeeFields } from "../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("employees") };
}

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await getActor();
  if (!can(actor, "employee:read")) return <Forbidden />;
  const { id } = await params;
  const { tab = "profile" } = await searchParams;

  let e;
  try {
    e = await getEmployee(actor, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "FORBIDDEN") return <Forbidden />;
    throw err;
  }

  const t = await getTranslations();
  const locale = await getLocale();
  const today = todayDate();
  const canEdit = can(actor, "employee:update");
  const current = e.allocations.find((a) => !a.effectiveTo || a.effectiveTo > today);
  const missing = missingDocuments(e.classification, e.documents.map((d) => d.type));
  const openWorkflows = e.workflows.filter((w) => w.status === "OPEN").length;
  const money = (v: unknown) => formatMoney(String(v ?? 0), { locale });

  const tabs = [
    { key: "profile", label: t("employees.tabs.profile") },
    { key: "allocations", label: t("employees.tabs.allocations"), count: e.allocations.length },
    { key: "documents", label: t("employees.tabs.documents"), count: e.documents.length },
    { key: "lifecycle", label: t("employees.tabs.lifecycle"), count: openWorkflows },
    ...(can(actor, "compensation:read") ? [{ key: "compensation", label: t("employees.tabs.compensation") }] : []),
  ].map((x) => ({ ...x, href: `/employees/${id}?tab=${x.key}` }));

  const editable = plain({ ...e, sponsorId: e.sponsor?.id ?? null, allocations: undefined, compensations: undefined, documents: undefined, workflows: undefined, sponsor: undefined });
  const initial = { ...editable, dateOfBirth: e.dateOfBirth ? toDateOnly(e.dateOfBirth) : null, joinedAt: e.joinedAt ? toDateOnly(e.joinedAt) : null };

  return (
    <>
      <PageHeader
        eyebrow={e.employeeNo}
        title={locale === "ar" && e.nameAr ? e.nameAr : e.nameEn}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={EMPLOYEE_STATUS_TONE[e.status]} dot>{t(`enums.EmployeeStatus.${e.status}`)}</Badge>
            <span>{t(`enums.WorkerClassification.${e.classification}`)}</span>
            {current && <>· <Link className="text-primary hover:underline" href={`/clients/${current.client.id}`}>{current.client.displayName}</Link></>}
          </span>
        }
        actions={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              {e.status === "ONBOARDING" && <ActionButton variant="primary" label={t("employees.activate")} endpoint={`/employees/${id}/activate`} successMessage={t("employees.activated")} />}
              {e.status === "ACTIVE" && <ActionButton variant="danger" label={t("employees.startExit")} endpoint={`/employees/${id}/exit`} confirm={t("employees.startExitConfirm")} confirmBody={t("employees.startExitBody")} />}
              {e.status === "OFFBOARDING" && (
                <FormButton size="sm" variant="danger" label={t("employees.completeExit")} title={t("employees.completeExit")} description={t("employees.completeExitBody")} endpoint={`/employees/${id}/exit/complete`} submitLabel={t("employees.completeExit")} initial={{ lastWorkingDay: toDateOnly(today) }} fields={[{ name: "lastWorkingDay", label: t("employees.lastWorkingDay"), type: "date", required: true, wide: true }]} />
              )}
              <FormButton size="sm" variant="secondary" wide label={t("common.edit")} title={t("common.edit")} initial={initial as never} fields={employeeFields(t, await sponsorOptions())} endpoint={`/employees/${id}`} method="PUT" submitLabel={t("common.save")} successMessage={t("clients.saved")} />
            </div>
          )
        }
      />
      {missing.length > 0 && e.status !== "EXITED" && (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          {t("employees.missingDocs", { docs: missing.map((d) => t(`enums.DocumentType.${d}`)).join("، ") })}
        </div>
      )}
      <PageTabs tabs={tabs} active={tab} />

      {tab === "profile" && (
        <Panel>
          <DetailList
            columns={3}
            items={[
              { label: t("employees.nameEn"), value: e.nameEn },
              { label: t("employees.nameAr"), value: e.nameAr },
              { label: t("employees.jobTitle"), value: e.jobTitle },
              { label: t("employees.sponsor"), value: e.sponsor?.name },
              { label: t("employees.nationality"), value: e.nationality },
              { label: t("employees.dateOfBirth"), value: e.dateOfBirth && formatDate(e.dateOfBirth, locale) },
              { label: t("employees.iqamaNo"), value: e.iqamaNo && <bdi className="font-mono text-xs">{e.iqamaNo}</bdi> },
              { label: t("employees.passportNo"), value: e.passportNo && <bdi className="font-mono text-xs">{e.passportNo}</bdi> },
              { label: t("employees.joinedAt"), value: e.joinedAt && formatDate(e.joinedAt, locale) },
              { label: t("clients.email"), value: e.email && <bdi>{e.email}</bdi> },
              { label: t("clients.phone"), value: e.phone && <bdi>{e.phone}</bdi> },
              ...(e.exitedAt ? [{ label: t("employees.lastWorkingDay"), value: formatDate(e.exitedAt, locale) }] : []),
            ]}
          />
        </Panel>
      )}

      {tab === "allocations" && (
        <Panel>
          <PanelHeader
            title={t("employees.tabs.allocations")}
            description={t("employees.allocationsHint")}
            actions={
              can(actor, "allocation:manage") && e.status !== "EXITED" && (
                <FormButton
                  size="sm"
                  label={t("employees.allocate")}
                  title={t("employees.allocate")}
                  description={t("employees.allocateHint")}
                  endpoint={`/employees/${id}/allocations`}
                  submitLabel={t("employees.allocate")}
                  initial={{ effectiveFrom: toDateOnly(today), billable: true }}
                  fields={[
                    { name: "clientId", label: t("employees.client"), type: "select", required: true, options: await clientOptions() },
                    { name: "effectiveFrom", label: t("clients.effectiveFrom"), type: "date", required: true },
                    { name: "locationId", label: t("employees.location"), type: "select", options: await locationOptions() },
                    { name: "managerUserId", label: t("employees.manager"), type: "select", options: await activeUserOptions() },
                    { name: "billable", label: t("employees.billable"), type: "checkbox" },
                  ]}
                />
              )
            }
          />
          <RecordTable
            rows={e.allocations}
            rowKey={(a) => a.id}
            emptyTitle={t("employees.noAllocations")}
            columns={[
              { header: t("employees.client"), cell: (a) => <Link className="font-medium hover:text-primary hover:underline" href={`/clients/${a.client.id}`}>{a.client.displayName}</Link> },
              { header: t("employees.location"), hideOnMobile: true, cell: (a) => a.location?.name ?? "—" },
              { header: t("employees.manager"), hideOnMobile: true, cell: (a) => a.manager?.name ?? "—" },
              { header: t("clients.from"), nowrap: true, cell: (a) => formatDate(a.effectiveFrom, locale) },
              { header: t("clients.to"), nowrap: true, cell: (a) => (a.effectiveTo ? formatDate(a.effectiveTo, locale) : t("clients.present")) },
              { header: t("employees.billable"), cell: (a) => t(a.billable ? "common.yes" : "common.no") },
            ]}
          />
        </Panel>
      )}

      {tab === "documents" && (
        <Panel>
          <PanelHeader
            title={t("employees.tabs.documents")}
            actions={
              can(actor, "document:manage") && (
                <FormButton size="sm" label={t("employees.addDocument")} title={t("employees.addDocument")} endpoint={`/documents?ownerType=EMPLOYEE&ownerId=${id}`} submitLabel={t("common.add")} fields={documentFields(t)} />
              )
            }
          />
          <RecordTable
            rows={e.documents}
            rowKey={(d) => d.id}
            emptyTitle={t("employees.noDocuments")}
            columns={[
              { header: t("employees.docType"), cell: (d) => <span className="font-medium">{t(`enums.DocumentType.${d.type}`)}</span> },
              { header: t("employees.docNumber"), hideOnMobile: true, cell: (d) => (d.number ? <Code>{d.number}</Code> : "—") },
              { header: t("employees.expiryDate"), nowrap: true, cell: (d) => (d.expiryDate ? formatDate(d.expiryDate, locale) : "—") },
              {
                header: t("common.status"),
                cell: (d) => {
                  const status = documentStatus(d.expiryDate, today);
                  return (
                    <Badge tone={DOC_TONE[status]} dot>
                      {status === "EXPIRING" ? t("employees.inDays", { days: daysUntil(d.expiryDate!, today) }) : t(`enums.DocStatus.${status}`)}
                    </Badge>
                  );
                },
              },
              { header: t("employees.file"), cell: (d) => (d.attachment ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/v1/attachments/${d.attachment.id}`}><FileText className="size-3.5" />{d.attachment.filename}</a> : "—") },
              { header: "", align: "end", cell: (d) => can(actor, "document:manage") && <ActionButton variant="ghost" label={t("common.remove")} method="DELETE" endpoint={`/documents/${d.id}`} /> },
            ]}
          />
        </Panel>
      )}

      {tab === "lifecycle" &&
        (e.workflows.length === 0 ? (
          <Panel><EmptyState compact title={t("employees.noWorkflows")} /></Panel>
        ) : (
          e.workflows.map((w) => (
            <Panel key={w.id}>
              <PanelHeader title={t(`enums.WorkflowType.${w.type}`)} description={formatDate(w.createdAt, locale)} actions={<Badge tone={w.status === "COMPLETED" ? "success" : "info"}>{t(`enums.WorkflowStatus.${w.status}`)}</Badge>} />
              <ul>
                {w.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-b border-border px-5 py-2.5 last:border-0">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", s.status === "DONE" ? "border-success bg-success text-white dark:text-black" : "border-border-strong")}>{s.status === "DONE" && <Check className="size-3" strokeWidth={3} />}</span>
                    <span className={cn("flex-1 text-sm", s.status === "DONE" && "text-muted")}>{t(`enums.WorkflowStep.${s.label}`)}</span>
                    {canEdit && <ActionButton variant="ghost" label={t(s.status === "DONE" ? "employees.reopenStep" : "employees.doneStep")} endpoint={`/workflow-steps/${s.id}`} json={{ done: s.status !== "DONE" }} />}
                  </li>
                ))}
              </ul>
            </Panel>
          ))
        ))}

      {tab === "compensation" && can(actor, "compensation:read") && (
        <Panel>
          <PanelHeader
            title={t("employees.tabs.compensation")}
            description={t("employees.compensationHint")}
            actions={
              can(actor, "compensation:manage") && (
                <FormButton
                  size="sm"
                  label={t("employees.addCompensation")}
                  title={t("employees.addCompensation")}
                  endpoint={`/employees/${id}/compensation`}
                  submitLabel={t("common.save")}
                  initial={{ effectiveFrom: toDateOnly(today) }}
                  fields={[
                    { name: "effectiveFrom", label: t("clients.effectiveFrom"), type: "date", required: true },
                    { name: "basic", label: t("employees.basic"), type: "money", required: true },
                    { name: "housing", label: t("employees.housing"), type: "money" },
                    { name: "transport", label: t("employees.transport"), type: "money" },
                    { name: "other", label: t("employees.other"), type: "money" },
                    { name: "gosiEmployer", label: t("employees.gosi"), type: "money" },
                    { name: "insuranceMonthly", label: t("employees.insurance"), type: "money" },
                  ]}
                />
              )
            }
          />
          <RecordTable
            rows={e.compensations}
            rowKey={(c) => c.id}
            emptyTitle={t("employees.noCompensation")}
            minWidth={760}
            columns={[
              { header: t("clients.from"), nowrap: true, cell: (c) => formatDate(c.effectiveFrom, locale) },
              { header: t("clients.to"), nowrap: true, cell: (c) => (c.effectiveTo ? formatDate(c.effectiveTo, locale) : t("clients.present")) },
              { header: t("employees.basic"), align: "end", nowrap: true, cell: (c) => money(c.basic) },
              { header: t("employees.housing"), align: "end", nowrap: true, cell: (c) => money(c.housing) },
              { header: t("employees.transport"), align: "end", nowrap: true, cell: (c) => money(c.transport) },
              { header: t("employees.gosi"), align: "end", nowrap: true, cell: (c) => money(c.gosiEmployer) },
              { header: t("employees.insurance"), align: "end", nowrap: true, cell: (c) => money(c.insuranceMonthly) },
              { header: t("employees.monthlyCost"), align: "end", nowrap: true, cell: (c) => <span className="font-medium">{money(sum(c.basic, c.housing, c.transport, c.other, c.gosiEmployer, c.insuranceMonthly))}</span> },
            ]}
          />
        </Panel>
      )}
    </>
  );
}
