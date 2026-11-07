import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { getActorOrNull } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { getInvoice } from "@/server/modules/billing/service";
import { formatDate } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import { BrandMark } from "@/components/shell/brand";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Invoice" };

/**
 * Bilingual printable invoice: "Save as PDF" from the browser gives correct Arabic shaping,
 * which embedded-PDF generators often break. Not a ZATCA e-invoice (open question Q14).
 */
export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const t = await getTranslations();
  if (!can(actor, "invoice:read")) return <p className="p-10">{t("states.forbiddenTitle")}</p>;
  const { id } = await params;
  let inv;
  try {
    inv = await getInvoice(id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")) return <p className="p-10">{t("states.forbiddenTitle")}</p>;
    throw e;
  }
  const m = (v: unknown) => formatMoney(String(v), { locale: "en" });
  const d = (v: Date | null) => (v ? formatDate(v, "en") : "—");
  const isCredit = inv.type === "CREDIT_NOTE";
  const company = {
    name: process.env.COMPANY_NAME || "EntityGate",
    vat: process.env.COMPANY_VAT_NUMBER,
    cr: process.env.COMPANY_CR_NUMBER,
    address: process.env.COMPANY_ADDRESS,
  };

  return (
    <main dir="ltr" className="mx-auto min-h-dvh max-w-[800px] bg-white p-10 text-[13px] text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden"><PrintButton label={t("billing.print")} /></div>
      <header className="flex items-start justify-between border-b border-black/20 pb-5">
        <div className="flex items-center gap-3">
          <BrandMark size={40} fixed />
          <div>
            <p className="text-base font-semibold">{company.name}</p>
            {company.address && <p className="text-xs text-black/60">{company.address}</p>}
            {company.vat && <p className="text-xs text-black/60">VAT / الرقم الضريبي: {company.vat}</p>}
            {company.cr && <p className="text-xs text-black/60">CR / السجل التجاري: {company.cr}</p>}
          </div>
        </div>
        <div className="text-end">
          <p className="text-xl font-semibold">{isCredit ? "Credit note" : "Invoice"} <span lang="ar" dir="rtl">{isCredit ? "إشعار دائن" : "فاتورة"}</span></p>
          <p className="font-mono text-sm">{inv.number ?? "DRAFT"}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-6 py-5">
        <div>
          <p className="text-xs text-black/50">Bill to / العميل</p>
          <p className="font-medium">{inv.client.legalName}</p>
          {inv.client.vatNumber && <p className="text-xs">VAT / الرقم الضريبي: {inv.client.vatNumber}</p>}
          {inv.client.crNumber && <p className="text-xs">CR / السجل التجاري: {inv.client.crNumber}</p>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] justify-end gap-x-4 gap-y-0.5 text-end">
          <dt className="text-black/50">Issue date / تاريخ الإصدار</dt><dd>{d(inv.issueDate)}</dd>
          {!isCredit && <><dt className="text-black/50">Due date / تاريخ الاستحقاق</dt><dd>{d(inv.dueDate)}</dd></>}
          {inv.periodStart && <><dt className="text-black/50">Period / الفترة</dt><dd>{d(inv.periodStart)} – {d(inv.periodEnd)}</dd></>}
          {inv.poNumber && <><dt className="text-black/50">PO / أمر الشراء</dt><dd>{inv.poNumber}</dd></>}
        </dl>
      </section>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black/30 text-xs">
            <th className="py-2 text-start font-medium">Description / الوصف</th>
            <th className="py-2 text-end font-medium">Amount / المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-b border-black/10">
              <td className="py-1.5 pe-4">{l.description}</td>
              <td className="py-1.5 text-end tabular-nums">{m(l.amount.toString())}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ms-auto mt-4 grid w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 tabular-nums">
        <dt>Subtotal / المجموع</dt><dd className="text-end">{m(inv.subtotal.toString())}</dd>
        <dt>VAT {money(inv.vatRate.toString()).times(100).toString()}% / الضريبة</dt><dd className="text-end">{m(inv.vatAmount.toString())}</dd>
        <dt className="border-t border-black/30 pt-1 font-semibold">Total / الإجمالي</dt><dd className="border-t border-black/30 pt-1 text-end font-semibold">{m(inv.total.toString())}</dd>
        {!isCredit && inv.outstanding !== inv.total.toFixed(2) && <><dt>Outstanding / المتبقي</dt><dd className="text-end">{m(inv.outstanding)}</dd></>}
      </dl>
      {inv.notes && <p className="mt-6 whitespace-pre-wrap text-xs text-black/70">{inv.notes}</p>}
    </main>
  );
}
