import type { Metadata } from "next";
import { Printer } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/server/errors";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { getInvoice } from "@/server/modules/billing/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Code, DetailList, RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { INVOICE_TONE, paymentFields } from "../../shared";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("billing") };
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!can(actor, "invoice:read")) return <Forbidden />;
  const { id } = await params;
  let inv;
  try {
    inv = await getInvoice(id);
  } catch (e) {
    if (e instanceof AppError && e.code === "FORBIDDEN") return <Forbidden />;
    throw e;
  }
  const t = await getTranslations();
  const locale = await getLocale();
  const m = (v: unknown) => formatMoney(String(v), { locale, accounting: true });
  const editable = ["DRAFT", "PENDING_APPROVAL"].includes(inv.status);
  const payable = ["ISSUED", "PARTIALLY_PAID", "DISPUTED"].includes(inv.status);
  const seeCost = can(actor, "finance:read");
  const lineCost = inv.lines.reduce((a, l) => a.plus(l.costAmount.toString()), money(0));

  return (
    <>
      <PageHeader
        eyebrow={t(`enums.InvoiceType.${inv.type}`)}
        title={inv.number ?? t("billing.draftInvoice")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={INVOICE_TONE[inv.status]} dot>{t(`enums.InvoiceStatus.${inv.status}`)}</Badge>
            <Link href={`/clients/${inv.client.id}`} className="text-primary hover:underline">{inv.client.displayName}</Link>
            {inv.billingRun && <span>· {inv.billingRun.period}</span>}
            {inv.creditFor && <span>· {t("billing.creditFor")} <Link className="text-primary hover:underline" href={`/billing/invoices/${inv.creditFor.id}`}>{inv.creditFor.number}</Link></span>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {inv.number && <Button asChild variant="secondary" size="sm"><a href={`/print/invoices/${id}`} target="_blank" rel="noreferrer"><Printer /> {t("billing.print")}</a></Button>}
            {editable && can(actor, "invoice:issue") && <ActionButton variant="primary" label={t("billing.issue")} endpoint={`/invoices/${id}/issue`} confirm={t("billing.issueConfirm")} confirmBody={t("billing.issueBody")} successMessage={t("billing.issued")} />}
            {payable && can(actor, "payment:record") && (
              <FormButton size="sm" label={t("billing.recordPayment")} title={t("billing.recordPayment")} endpoint={`/payments`} submitLabel={t("billing.recordPayment")} successMessage={t("billing.paymentSaved")} initial={{ amount: inv.outstanding, receivedAt: toDateOnly(todayDate()), method: "bank_transfer" }} fields={paymentFields(t, [], inv.client.id)} hiddenValues={{ clientId: inv.client.id, invoiceId: id }} />
            )}
            {payable && can(actor, "invoice:approve") && <ActionButton label={t(inv.status === "DISPUTED" ? "billing.undispute" : "billing.dispute")} endpoint={`/invoices/${id}/dispute`} json={{ disputed: inv.status !== "DISPUTED" }} />}
            {(payable || inv.status === "PAID") && inv.type !== "CREDIT_NOTE" && can(actor, "invoice:void") && (
              <FormButton size="sm" variant="secondary" label={t("billing.creditNote")} title={t("billing.creditNote")} description={t("billing.creditHint")} endpoint={`/invoices/${id}/credit`} submitLabel={t("billing.creditNote")} fields={[{ name: "amount", label: t("billing.creditAmount"), type: "money", required: true, wide: true }, { name: "reason", label: t("cases.reason"), type: "textarea", required: true }]} />
            )}
            {inv.status !== "VOID" && inv.status !== "PAID" && inv.paymentAllocations.length === 0 && can(actor, "invoice:void") && <ActionButton variant="danger" label={t("billing.void")} endpoint={`/invoices/${id}/void`} confirm={t("billing.voidConfirm")} confirmBody={t("billing.voidBody")} />}
          </div>
        }
      />
      <div className="card-grid items-start lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHeader
            title={t("billing.lines")}
            actions={editable && can(actor, "invoice:create") && <FormButton size="sm" variant="secondary" label={t("billing.addLine")} title={t("billing.addLine")} endpoint={`/invoices/${id}/lines`} submitLabel={t("common.add")} fields={[{ name: "description", label: t("billing.lineDescription"), required: true, wide: true }, { name: "amount", label: t("billing.amount"), type: "money", required: true, wide: true }]} />}
          />
          <RecordTable
            rows={inv.lines}
            rowKey={(l) => l.id}
            emptyTitle={t("billing.noLines")}
            minWidth={520}
            columns={[
              { header: t("billing.lineDescription"), cell: (l) => l.description },
              ...(seeCost ? [{ header: t("billing.cost"), align: "end" as const, nowrap: true, hideOnMobile: true, cell: (l: (typeof inv.lines)[number]) => <span className="text-muted">{m(l.costAmount.toString())}</span> }] : []),
              { header: t("billing.amount"), align: "end", nowrap: true, cell: (l) => m(l.amount.toString()) },
              ...(editable && can(actor, "invoice:create") ? [{ header: "", align: "end" as const, cell: (l: (typeof inv.lines)[number]) => <ActionButton variant="ghost" label={t("common.remove")} method="DELETE" endpoint={`/invoices/${id}/lines/${l.id}`} /> }] : []),
            ]}
          />
          <dl className="grid justify-end gap-1 border-t border-border px-5 py-4 text-sm">
            <div className="flex justify-between gap-12"><dt className="text-muted">{t("billing.subtotal")}</dt><dd className="num">{m(inv.subtotal.toString())}</dd></div>
            <div className="flex justify-between gap-12"><dt className="text-muted">{t("billing.vat")} (<span className="num">{money(inv.vatRate.toString()).times(100).toString()}%</span>)</dt><dd className="num">{m(inv.vatAmount.toString())}</dd></div>
            <div className="flex justify-between gap-12 font-semibold"><dt>{t("billing.total")}</dt><dd className="num">{m(inv.total.toString())}</dd></div>
            {inv.number && <div className="flex justify-between gap-12 font-semibold text-primary"><dt>{t("billing.outstanding")}</dt><dd className="num">{m(inv.outstanding)}</dd></div>}
            {seeCost && !lineCost.isZero() && <div className="flex justify-between gap-12 text-xs text-muted"><dt>{t("billing.marginOnInvoice")}</dt><dd className="num">{m(money(inv.subtotal.toString()).minus(lineCost).toString())}</dd></div>}
          </dl>
        </Panel>
        <div className="card-grid">
          <Panel>
            <PanelHeader title={t("clients.profile")} actions={can(actor, "invoice:create") && inv.status !== "VOID" && <FormButton size="sm" variant="ghost" label={t("common.edit")} title={t("common.edit")} endpoint={`/invoices/${id}/meta`} submitLabel={t("common.save")} initial={{ poNumber: inv.poNumber, notes: inv.notes }} fields={[{ name: "poNumber", label: t("billing.po"), ltr: true, wide: true }, { name: "notes", label: t("common.notes"), type: "textarea" }]} />} />
            <DetailList
              columns={1}
              items={[
                { label: t("billing.issueDate"), value: inv.issueDate ? formatDate(inv.issueDate, locale) : "—" },
                { label: t("billing.dueDate"), value: inv.dueDate ? formatDate(inv.dueDate, locale) : "—" },
                { label: t("billing.period"), value: inv.periodStart && inv.periodEnd ? `${formatDate(inv.periodStart, locale)} – ${formatDate(inv.periodEnd, locale)}` : "—" },
                { label: t("billing.po"), value: inv.poNumber ? <Code>{inv.poNumber}</Code> : "—" },
                { label: t("common.notes"), value: inv.notes },
                ...(inv.issuedBy ? [{ label: t("billing.issuedBy"), value: inv.issuedBy.name }] : []),
              ]}
            />
          </Panel>
          {(inv.paymentAllocations.length > 0 || inv.creditNotes.length > 0) && (
            <Panel>
              <PanelHeader title={t("billing.settlements")} />
              <ul>
                {inv.paymentAllocations.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-sm last:border-0">
                    <span><span className="block">{t(`enums.PaymentMethod.${p.payment.method}`)}{p.payment.reference && <> · <Code>{p.payment.reference}</Code></>}{p.payment.proofAttachmentId && <> · <a className="text-primary hover:underline" href={`/api/v1/attachments/${p.payment.proofAttachmentId}`}>{t("billing.proof")}</a></>}</span><span className="text-xs text-muted num">{formatDate(p.payment.receivedAt, locale)}</span></span>
                    <span className="font-medium num">{m(p.amount.toString())}</span>
                  </li>
                ))}
                {inv.creditNotes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-sm last:border-0">
                    <Link className="text-primary hover:underline" href={`/billing/invoices/${c.id}`}>{c.number}</Link>
                    <span className="font-medium num">{m(c.total.toString())}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
