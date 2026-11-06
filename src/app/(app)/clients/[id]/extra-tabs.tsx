import { FileText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { can, type Actor } from "@/server/rbac/policy";
import { db } from "@/server/db";
import { activeOn } from "@/server/util";
import { clientDocuments } from "@/server/modules/employees/service";
import { listInvoicesQuery } from "@/server/modules/billing/schema";
import { listInvoices } from "@/server/modules/billing/service";
import { formatDate, todayDate } from "@/lib/dates";
import { pnl, recentPeriods } from "@/server/modules/finance/service";
import { formatMoney, formatPercent } from "@/lib/money";
import { documentStatus } from "@/lib/workforce";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { Code, RecordLink, RecordTable } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { DOC_TONE, documentFields, EMPLOYEE_STATUS_TONE } from "../../employees/shared";
import { SEVERITY_TONE, STAGE_TONE } from "../../cases/shared";
import { TASK_TONE } from "../../tasks/shared";
import { INVOICE_TONE } from "../../billing/shared";

type T = (key: string) => string;

/** Tabs contributed by other modules. Each milestone adds its own. */
export function clientExtraTabs(actor: Actor, t: T): { key: string; label: string; count?: number; show?: boolean }[] {
  return [
    { key: "employees", label: t("clients.tabs.employees"), show: can(actor, "employee:read") },
    { key: "cases", label: t("meta.cases"), show: can(actor, "case:read") },
    { key: "tasks", label: t("meta.tasks"), show: can(actor, "task:read") },
    { key: "billing", label: t("meta.billing"), show: can(actor, "invoice:read") },
    { key: "finance", label: t("meta.finance"), show: can(actor, "finance:read") },
    { key: "documents", label: t("clients.tabs.documents"), show: can(actor, "document:read") },
  ];
}

export async function ClientExtraTab({ tab, clientId, actor }: { tab: string; clientId: string; actor: Actor }) {
  const t = await getTranslations();
  const locale = await getLocale();

  if (tab === "employees" && can(actor, "employee:read")) {
    const allocations = await db.allocation.findMany({
      where: { clientId, ...activeOn() },
      orderBy: { employee: { nameEn: "asc" } },
      select: { id: true, effectiveFrom: true, employee: { select: { id: true, employeeNo: true, nameEn: true, nameAr: true, status: true, classification: true, jobTitle: true } } },
    });
    return (
      <Panel>
        <PanelHeader title={t("clients.tabs.employees")} />
        <RecordTable
          rows={allocations}
          rowKey={(a) => a.id}
          emptyTitle={t("employees.emptyTitle")}
          columns={[
            { header: t("employees.employee"), cell: (a) => <RecordLink href={`/employees/${a.employee.id}`} sub={<Code>{a.employee.employeeNo}</Code>}>{locale === "ar" && a.employee.nameAr ? a.employee.nameAr : a.employee.nameEn}</RecordLink> },
            { header: t("employees.jobTitle"), hideOnMobile: true, cell: (a) => a.employee.jobTitle ?? "—" },
            { header: t("employees.classification"), cell: (a) => t(`enums.WorkerClassification.${a.employee.classification}`) },
            { header: t("clients.from"), nowrap: true, cell: (a) => formatDate(a.effectiveFrom, locale) },
            { header: t("common.status"), cell: (a) => <Badge tone={EMPLOYEE_STATUS_TONE[a.employee.status]} dot>{t(`enums.EmployeeStatus.${a.employee.status}`)}</Badge> },
          ]}
        />
      </Panel>
    );
  }

  if (tab === "cases" && can(actor, "case:read")) {
    const rows = await db.case.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 100, include: { owner: { select: { name: true } } } });
    return (
      <Panel>
        <PanelHeader title={t("meta.cases")} />
        <RecordTable
          rows={rows}
          rowKey={(c) => c.id}
          emptyTitle={t("cases.emptyTitle")}
          columns={[
            { header: t("cases.case"), cell: (c) => <RecordLink href={`/cases/${c.id}`} sub={<Code>{c.number}</Code>}>{c.title}</RecordLink> },
            { header: t("tasks.owner"), hideOnMobile: true, cell: (c) => c.owner.name },
            { header: t("cases.stage"), cell: (c) => <Badge tone={STAGE_TONE[c.stage]}>{t(`enums.CaseStage.${c.stage}`)}</Badge> },
            { header: t("cases.severity"), cell: (c) => <Badge tone={SEVERITY_TONE[c.severity]}>{t(`enums.Severity.${c.severity}`)}</Badge> },
            { header: t("cases.slaDue"), nowrap: true, cell: (c) => (c.slaDueAt ? formatDate(c.slaDueAt, locale) : "—") },
          ]}
        />
      </Panel>
    );
  }

  if (tab === "tasks" && can(actor, "task:read")) {
    const rows = await db.task.findMany({ where: { clientId, archivedAt: null }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 100, include: { owner: { select: { name: true } } } });
    return (
      <Panel>
        <PanelHeader title={t("meta.tasks")} />
        <RecordTable
          rows={rows}
          rowKey={(r) => r.id}
          emptyTitle={t("tasks.emptyTitle")}
          columns={[
            { header: t("tasks.task"), cell: (r) => <RecordLink href={`/tasks/${r.id}`} sub={<Code>{r.number}</Code>}>{r.title}</RecordLink> },
            { header: t("tasks.owner"), hideOnMobile: true, cell: (r) => r.owner.name },
            { header: t("tasks.due"), nowrap: true, cell: (r) => (r.dueAt ? formatDate(r.dueAt, locale) : "—") },
            { header: t("common.status"), cell: (r) => <Badge tone={TASK_TONE[r.status]} dot>{t(`enums.TaskStatus.${r.status}`)}</Badge> },
          ]}
        />
      </Panel>
    );
  }

  if (tab === "billing" && can(actor, "invoice:read")) {
    const { rows } = await listInvoices(listInvoicesQuery.parse({ client: clientId, view: "all" }));
    return (
      <Panel>
        <PanelHeader title={t("meta.billing")} />
        <RecordTable
          rows={rows}
          rowKey={(i) => i.id}
          emptyTitle={t("billing.emptyTitle")}
          columns={[
            { header: t("billing.invoice"), cell: (i) => <RecordLink href={`/billing/invoices/${i.id}`} sub={t(`enums.InvoiceType.${i.type}`)}>{i.number ? <Code>{i.number}</Code> : t("billing.draft")}</RecordLink> },
            { header: t("billing.total"), align: "end", nowrap: true, cell: (i) => formatMoney(i.total.toString(), { locale }) },
            { header: t("billing.outstanding"), align: "end", nowrap: true, cell: (i) => (i.number ? formatMoney(i.outstanding, { locale }) : "—") },
            { header: t("billing.dueDate"), nowrap: true, cell: (i) => (i.dueDate ? formatDate(i.dueDate, locale) : "—") },
            { header: t("common.status"), cell: (i) => <Badge tone={INVOICE_TONE[i.status]} dot>{t(`enums.InvoiceStatus.${i.status}`)}</Badge> },
          ]}
        />
      </Panel>
    );
  }

  if (tab === "finance" && can(actor, "finance:read")) {
    const months = recentPeriods(6);
    const data = await pnl(months[5], months[0], [clientId]);
    const m = (v: { toString(): string }) => formatMoney(v.toString(), { locale, accounting: true });
    return (
      <Panel>
        <PanelHeader title={t("finance.pnl")} description={t("finance.pnlHint")} />
        <RecordTable
          rows={[...data.months].reverse()}
          rowKey={(r) => r.id}
          emptyTitle={t("finance.noPnl")}
          minWidth={560}
          footer={<div className="flex flex-wrap justify-end gap-6 px-5 py-3 text-sm font-semibold"><span>{t("finance.contribution")}: <span className="num">{m(data.company.contribution)}</span></span><span>{t("finance.margin")}: <span className="num">{data.company.contributionMargin === null ? "—" : formatPercent(data.company.contributionMargin)}</span></span></div>}
          columns={[
            { header: t("billing.month"), cell: (r) => <bdi className="font-medium num">{r.name}</bdi> },
            { header: t("finance.revenue"), align: "end", nowrap: true, cell: (r) => m(r.pnl.revenue) },
            { header: t("finance.directCost"), align: "end", nowrap: true, cell: (r) => m(r.pnl.directCost) },
            { header: t("finance.contribution"), align: "end", nowrap: true, cell: (r) => <span className={r.pnl.contribution.isNegative() ? "font-medium text-danger" : "font-medium"}>{m(r.pnl.contribution)}</span> },
            { header: t("finance.margin"), align: "end", cell: (r) => (r.pnl.contributionMargin === null ? "—" : formatPercent(r.pnl.contributionMargin)) },
          ]}
        />
      </Panel>
    );
  }

  if (tab === "documents" && can(actor, "document:read")) {
    const docs = await clientDocuments(clientId);
    const today = todayDate();
    return (
      <Panel>
        <PanelHeader
          title={t("clients.tabs.documents")}
          actions={can(actor, "document:manage") && <FormButton size="sm" label={t("employees.addDocument")} title={t("employees.addDocument")} endpoint={`/documents?ownerType=CLIENT&ownerId=${clientId}`} submitLabel={t("common.add")} fields={documentFields(t)} />}
        />
        <RecordTable
          rows={docs}
          rowKey={(d) => d.id}
          emptyTitle={t("employees.noDocuments")}
          columns={[
            { header: t("employees.docType"), cell: (d) => <span className="font-medium">{t(`enums.DocumentType.${d.type}`)}</span> },
            { header: t("employees.expiryDate"), nowrap: true, cell: (d) => (d.expiryDate ? formatDate(d.expiryDate, locale) : "—") },
            { header: t("common.status"), cell: (d) => { const s = documentStatus(d.expiryDate, today); return <Badge tone={DOC_TONE[s]} dot>{t(`enums.DocStatus.${s}`)}</Badge>; } },
            { header: t("employees.file"), cell: (d) => (d.attachment ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/api/v1/attachments/${d.attachment.id}`}><FileText className="size-3.5" />{d.attachment.filename}</a> : "—") },
            { header: "", align: "end", cell: (d) => can(actor, "document:manage") && <ActionButton variant="ghost" label={t("common.remove")} method="DELETE" endpoint={`/documents/${d.id}`} /> },
          ]}
        />
      </Panel>
    );
  }
  return null;
}
