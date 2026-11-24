import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { invoiceBreakdown } from "@/server/modules/billing/breakdown";
import { ONE_OFF_CHARGES, SAR_PER_USD, STANDING_CHARGES, type Service } from "@/lib/breakdown";
import { add, formatMoney, money } from "@/lib/money";
import { FormButton, type FieldSpec } from "@/components/patterns/form-dialog";
import { RecordTable } from "@/components/patterns/record";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/misc";

/** Edit-form fields and the service each belongs to: a field shows only if its service is on this invoice. */
const FIELDS: { name: string; service: Service; label: string }[] = [
  { name: "deductions", service: "salary", label: "breakdown.deductions" },
  { name: "gasSupport", service: "gasSupport", label: "breakdown.gasSupport" },
  { name: "kpi", service: "kpi", label: "breakdown.kpi" },
  ...[...STANDING_CHARGES, ...ONE_OFF_CHARGES].map((k) => ({ name: k, service: k as Service, label: `charges.${k}` })),
];

/** The client's per-employee breakdown of a monthly invoice: direct, indirect, fee and total. */
export async function BreakdownPanel({ invoiceId, editable, total, expenses }: { invoiceId: string; editable: boolean; total: string; expenses: boolean }) {
  const { rows, services } = await invoiceBreakdown(invoiceId);
  if (!rows.length) return null;
  const t = await getTranslations();
  const locale = await getLocale();
  const m = (v: { toString(): string }) => formatMoney(v.toString(), { locale });
  const sum = (pick: (r: (typeof rows)[number]) => { toString(): string }) => add(...rows.map((r) => pick(r).toString()));
  const s4 = (v: { toString(): string }) => (money(v.toString()).isZero() ? null : money(v.toString()).toDecimalPlaces(4).toString());
  const showDirect = services.some((s) => ["salary", "gasSupport", "kpi"].includes(s));

  const fields: FieldSpec[] = [
    { name: "workdays", label: t("breakdown.workdays"), type: "number", required: true, hint: t("breakdown.workdaysHint") },
    ...FIELDS.filter((f) => services.includes(f.service)).map((f): FieldSpec => ({ name: f.name, label: t(f.label), type: "money" })),
  ];
  if (fields.length > 1) fields[1] = { ...fields[1], hint: t("breakdown.standingHint") };

  return (
    <Panel>
      <PanelHeader
        title={t(expenses ? "breakdown.titleExpenses" : "breakdown.title")}
        description={t(editable ? "breakdown.hintDraft" : "breakdown.hint")}
        actions={
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/v1/invoices/${invoiceId}/breakdown`} download>
              <Download /> {t("breakdown.download")}
            </a>
          </Button>
        }
      />
      <RecordTable
        rows={rows}
        rowKey={(r) => r.lineId}
        emptyTitle=""
        minWidth={showDirect ? 880 : 640}
        columns={[
          { header: t("finance.employee"), cell: (r) => <span><span className="block font-medium">{r.stored.employeeName}</span><span className="block text-xs text-muted">{[t(r.stored.ownSponsorship ? "breakdown.ourSponsorship" : "breakdown.clientSponsorship"), r.stored.region].filter(Boolean).join(" · ")}</span></span> },
          ...(services.includes("salary") ? [{ header: t("breakdown.salary"), align: "end" as const, nowrap: true, cell: (r: (typeof rows)[number]) => m(money(r.stored.salary.toString()).toDecimalPlaces(2)) }] : []),
          { header: t("breakdown.workdays"), align: "end", cell: (r) => <span className="num">{Number(r.stored.workdays)}</span> },
          ...(showDirect ? [{ header: t("breakdown.direct"), align: "end" as const, nowrap: true, cell: (r: (typeof rows)[number]) => m(r.calc.directTotal.toDecimalPlaces(2)) }] : []),
          { header: t("breakdown.indirect"), align: "end", nowrap: true, cell: (r) => m(r.calc.indirectTotal.toDecimalPlaces(2)) },
          { header: t("breakdown.fee"), align: "end", nowrap: true, cell: (r) => m(r.calc.serviceFee) },
          { header: t("billing.total"), align: "end", nowrap: true, cell: (r) => <span className="font-medium">{m(r.calc.total)}</span> },
          ...(editable
            ? [{
                header: "",
                align: "end" as const,
                cell: (r: (typeof rows)[number]) => (
                  <FormButton
                    size="sm"
                    variant="ghost"
                    label={t("common.edit")}
                    title={r.stored.employeeName}
                    description={t("breakdown.editHint")}
                    endpoint={`/invoices/${invoiceId}/breakdown/${r.lineId}`}
                    method="PUT"
                    submitLabel={t("common.save")}
                    successMessage={t("breakdown.saved")}
                    initial={{ workdays: String(Number(r.stored.workdays)), ...Object.fromEntries(FIELDS.map((f) => [f.name, s4(r.stored[f.name as keyof typeof r.stored] as { toString(): string })])) }}
                    fields={fields}
                    wide
                  />
                ),
              }]
            : []),
        ]}
        footer={
          <dl className="flex flex-wrap justify-end gap-x-8 gap-y-1 px-5 py-3 text-sm">
            {showDirect && <div className="flex gap-2"><dt className="text-muted">{t("breakdown.direct")}</dt><dd className="num">{m(sum((r) => r.calc.directTotal.toDecimalPlaces(2)))}</dd></div>}
            <div className="flex gap-2"><dt className="text-muted">{t("breakdown.indirect")}</dt><dd className="num">{m(sum((r) => r.calc.indirectTotal.toDecimalPlaces(2)))}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">{t("breakdown.fee")}</dt><dd className="num">{m(sum((r) => r.calc.serviceFee))}</dd></div>
            <div className="flex gap-2 font-medium"><dt>{t("breakdown.usd")}</dt><dd className="num" dir="ltr">{formatMoney(money(total).dividedBy(SAR_PER_USD).toDecimalPlaces(2).toString(), { locale, currency: "USD" })}</dd></div>
          </dl>
        }
      />
    </Panel>
  );
}
