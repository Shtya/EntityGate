import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BILLING_MODELS } from "@/server/modules/clients/schema";
import { activeUserOptions, getClient, nextStatuses } from "@/server/modules/clients/service";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { plain, fractionToPercent } from "@/server/util";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getLocale } from "next-intl/server";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton, type FieldSpec } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, DetailList, PageTabs, RecordTable } from "@/components/patterns/record";
import { EmptyState } from "@/components/patterns/states";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { CLIENT_STATUS_TONE, HEALTH_TONE, clientFields } from "../shared";
import { ClientExtraTab, clientExtraTabs } from "./extra-tabs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("clients") };
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await getActor();
  if (!can(actor, "client:read")) return <Forbidden />;
  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  let client;
  try {
    client = await getClient(id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return <Forbidden />; // UAT-01
    throw e;
  }

  const t = await getTranslations();
  const locale = await getLocale();
  const owner = client.assignments.find((a) => a.role === "OWNER" && (!a.effectiveTo || a.effectiveTo > todayDate()));
  const moves = nextStatuses(client.status);
  const profile = plain({ ...client, contacts: undefined, contracts: undefined, assignments: undefined });
  const money = (v: unknown) => (v === null || v === undefined ? "—" : formatMoney(String(v), { locale }));

  const rateFields = (): FieldSpec[] => [
    { name: "effectiveFrom", label: t("clients.effectiveFrom"), type: "date", required: true },
    { name: "feePercent", label: t("clients.feePercent"), type: "money" },
    { name: "feePerHead", label: t("clients.feePerHead"), type: "money" },
    { name: "feeFixedMonthly", label: t("clients.feeFixed"), type: "money" },
    { name: "sponsorshipRenewalFee", label: t("clients.renewalFee"), type: "money" },
  ];

  const tabs = [
    { key: "overview", label: t("clients.tabs.overview") },
    { key: "contracts", label: t("clients.tabs.contracts"), count: client.contracts.length, show: can(actor, "contract:read") },
    { key: "contacts", label: t("clients.tabs.contacts"), count: client.contacts.length },
    { key: "team", label: t("clients.tabs.team") },
    ...clientExtraTabs(actor, t),
  ].filter((x) => x.show !== false).map((x) => ({ ...x, href: `/clients/${id}?tab=${x.key}` }));

  return (
    <>
      <PageHeader
        eyebrow={client.code}
        title={client.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={CLIENT_STATUS_TONE[client.status]}>{t(`enums.ClientStatus.${client.status}`)}</Badge>
            {client.health && <Badge tone={HEALTH_TONE[client.health]} dot>{t(`enums.ClientHealth.${client.health}`)}</Badge>}
            <span>{owner?.user.name ?? t("clients.noOwner")}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {can(actor, "client:archive") &&
              moves.map((s) => (
                <ActionButton
                  key={s}
                  label={t("clients.moveTo", { status: t(`enums.ClientStatus.${s}`) })}
                  endpoint={`/clients/${id}/status`}
                  json={{ status: s }}
                  variant={s === "EXITED" ? "danger" : "secondary"}
                  confirm={t("clients.moveConfirm")}
                  successMessage={t("clients.moved")}
                />
              ))}
            {can(actor, "client:update") && (
              <FormButton variant="secondary" size="sm" label={t("common.edit")} title={t("common.edit")} fields={clientFields(t)} initial={profile as never} endpoint={`/clients/${id}`} method="PUT" submitLabel={t("common.save")} successMessage={t("clients.saved")} />
            )}
          </div>
        }
      />
      <PageTabs tabs={tabs} active={tab} />

      {tab === "overview" && (
        <Panel>
          <PanelHeader title={t("clients.profile")} />
          <DetailList
            columns={3}
            items={[
              { label: t("clients.legalName"), value: client.legalName },
              { label: t("clients.crNumber"), value: client.crNumber && <bdi>{client.crNumber}</bdi> },
              { label: t("clients.vatNumber"), value: client.vatNumber && <bdi>{client.vatNumber}</bdi> },
              { label: t("clients.parentCompany"), value: client.parentCompany },
              { label: t("clients.country"), value: client.country },
              { label: t("clients.industry"), value: client.industry },
              { label: t("common.notes"), value: client.notes },
            ]}
          />
        </Panel>
      )}

      {tab === "contracts" && can(actor, "contract:read") && (
        <Panel>
          <PanelHeader
            title={t("clients.contracts")}
            actions={
              can(actor, "contract:manage") && (
                <FormButton
                  size="sm"
                  label={t("clients.addContract")}
                  title={t("clients.addContract")}
                  description={t("clients.pricingHint")}
                  endpoint={`/clients/${id}/contracts`}
                  submitLabel={t("clients.addContract")}
                  initial={{ paymentTermsDays: "30", renewalNoticeDays: "60", vatPercent: "15", billingModel: "COST_PLUS_PERCENT", startDate: toDateOnly(todayDate()) }}
                  fields={[
                    { name: "number", label: t("clients.number"), required: true, ltr: true },
                    { name: "billingModel", label: t("clients.model"), type: "select", required: true, options: BILLING_MODELS.map((m) => ({ value: m, label: t(`enums.BillingModel.${m}`) })) },
                    { name: "startDate", label: t("clients.startDate"), type: "date", required: true },
                    { name: "endDate", label: t("clients.endDate"), type: "date" },
                    { name: "paymentTermsDays", label: t("clients.paymentTerms"), type: "number", required: true },
                    { name: "renewalNoticeDays", label: t("clients.renewalNotice"), type: "number", required: true },
                    { name: "vatPercent", label: t("clients.vat"), type: "money", required: true },
                    { name: "feePercent", label: t("clients.feePercent"), type: "money" },
                    { name: "feePerHead", label: t("clients.feePerHead"), type: "money" },
                    { name: "feeFixedMonthly", label: t("clients.feeFixed"), type: "money" },
                    { name: "sponsorshipRenewalFee", label: t("clients.renewalFee"), type: "money" },
                  ]}
                />
              )
            }
          />
          {client.contracts.length === 0 ? (
            <EmptyState compact title={t("clients.noContracts")} description={t("clients.noContractsBody")} />
          ) : (
            <div className="divide-y divide-border">
              {client.contracts.map((c) => {
                const rate = c.rateCards.find((r) => !r.effectiveTo) ?? c.rateCards[0];
                return (
                  <div key={c.id} className="grid gap-3 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Code>{c.number}</Code>
                      <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{t(`enums.ContractStatus.${c.status}`)}</Badge>
                      <span className="text-xs text-muted num">
                        {formatDate(c.startDate, locale)} – {c.endDate ? formatDate(c.endDate, locale) : t("clients.present")}
                      </span>
                      {can(actor, "contract:manage") && c.status === "ACTIVE" && (
                        <span className="ms-auto flex gap-2">
                          <FormButton variant="secondary" size="sm" label={t("clients.newRate")} title={t("clients.newRate")} description={t("enums.BillingModel." + c.billingModel)} fields={rateFields()} endpoint={`/contracts/${c.id}/rate-cards`} submitLabel={t("common.save")} successMessage={t("clients.rateSaved")} />
                          <ActionButton label={t("clients.terminate")} variant="danger" endpoint={`/contracts/${c.id}/status`} json={{ status: "TERMINATED" }} confirm={t("clients.terminateConfirm")} confirmBody={t("clients.terminateBody")} />
                        </span>
                      )}
                    </div>
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                      <div><dt className="text-xs text-faint">{t("clients.model")}</dt><dd>{t(`enums.BillingModel.${c.billingModel}`)}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.paymentTerms")}</dt><dd className="num">{c.paymentTermsDays}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.feePercent")}</dt><dd className="num">{rate?.feePercent ? `${fractionToPercent(rate.feePercent.toString())}%` : "—"}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.feePerHead")}</dt><dd className="num">{money(rate?.feePerHead)}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.feeFixed")}</dt><dd className="num">{money(rate?.feeFixedMonthly)}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.renewalFee")}</dt><dd className="num">{money(rate?.sponsorshipRenewalFee)}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.effectiveFrom")}</dt><dd className="num">{rate ? formatDate(rate.effectiveFrom, locale) : "—"}</dd></div>
                      <div><dt className="text-xs text-faint">{t("clients.vat")}</dt><dd className="num">{fractionToPercent(c.vatRate.toString())}%</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {tab === "contacts" && (
        <Panel>
          <PanelHeader
            title={t("clients.contacts")}
            actions={
              can(actor, "client:update") && (
                <FormButton
                  size="sm"
                  label={t("clients.addContact")}
                  title={t("clients.addContact")}
                  endpoint={`/clients/${id}/contacts`}
                  submitLabel={t("common.add")}
                  fields={[
                    { name: "name", label: t("clients.name"), required: true },
                    { name: "role", label: t("clients.jobRole") },
                    { name: "email", label: t("clients.email"), type: "email" },
                    { name: "phone", label: t("clients.phone"), type: "tel" },
                    { name: "isBillingContact", label: t("clients.billingContact"), type: "checkbox" },
                  ]}
                />
              )
            }
          />
          <RecordTable
            rows={client.contacts}
            rowKey={(c) => c.id}
            emptyTitle={t("clients.noContacts")}
            minWidth={480}
            columns={[
              { header: t("clients.name"), cell: (c) => <span className="flex items-center gap-2 font-medium">{c.name}{c.isBillingContact && <Badge tone="accent">{t("clients.billingBadge")}</Badge>}</span> },
              { header: t("clients.jobRole"), cell: (c) => c.role ?? "—", hideOnMobile: true },
              { header: t("clients.email"), cell: (c) => (c.email ? <bdi>{c.email}</bdi> : "—") },
              { header: t("clients.phone"), cell: (c) => (c.phone ? <bdi>{c.phone}</bdi> : "—"), hideOnMobile: true },
              { header: "", align: "end", cell: (c) => can(actor, "client:update") && <ActionButton label={t("common.remove")} variant="ghost" method="DELETE" endpoint={`/clients/${id}/contacts/${c.id}`} /> },
            ]}
          />
        </Panel>
      )}

      {tab === "team" && (
        <Panel>
          <PanelHeader
            title={t("clients.team")}
            description={t("clients.teamHint")}
            actions={
              can(actor, "client:assign") && (
                <FormButton
                  size="sm"
                  label={t("clients.assign")}
                  title={t("clients.assign")}
                  endpoint={`/clients/${id}/assignments`}
                  submitLabel={t("clients.assign")}
                  successMessage={t("clients.assigned")}
                  initial={{ role: "OWNER", effectiveFrom: toDateOnly(todayDate()) }}
                  fields={[
                    { name: "userId", label: t("clients.person"), type: "select", required: true, options: await activeUserOptions(), wide: true },
                    { name: "role", label: t("clients.role"), type: "select", required: true, options: (["OWNER", "SUPPORT"] as const).map((r) => ({ value: r, label: t(`enums.AssignmentRole.${r}`) })) },
                    { name: "effectiveFrom", label: t("clients.from"), type: "date", required: true },
                  ]}
                />
              )
            }
          />
          <RecordTable
            rows={client.assignments}
            rowKey={(a) => a.id}
            emptyTitle={t("clients.noTeam")}
            minWidth={480}
            columns={[
              { header: t("clients.person"), cell: (a) => <span className="font-medium">{a.user.name}</span> },
              { header: t("clients.role"), cell: (a) => <Badge tone={a.role === "OWNER" ? "primary" : "neutral"}>{t(`enums.AssignmentRole.${a.role}`)}</Badge> },
              { header: t("clients.from"), nowrap: true, cell: (a) => formatDate(a.effectiveFrom, locale) },
              { header: t("clients.to"), nowrap: true, cell: (a) => (a.effectiveTo ? formatDate(a.effectiveTo, locale) : t("clients.present")) },
              { header: "", align: "end", cell: (a) => can(actor, "client:assign") && !a.effectiveTo && <ActionButton label={t("clients.endAssignment")} variant="ghost" method="DELETE" endpoint={`/clients/${id}/assignments/${a.id}`} /> },
            ]}
          />
        </Panel>
      )}

      <ClientExtraTab tab={tab} clientId={id} actor={actor} />
    </>
  );
}
