"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface ServiceRow {
  service: string;
  direct: boolean;
  enabled: boolean;
  part: "PAYROLL" | "EXPENSES";
  feeType: "CONTRACT" | "PERCENT" | "FIXED";
  /** As shown to people: 11 for 11%, or an amount. */
  feeValue: string;
}

/**
 * One client's services, as the columns of their breakdown sheet: on or off, which invoice each
 * goes on, and its own fee. Saved together; the next billing run uses them.
 */
export function ServiceRulesEditor({ clientId, initial, canEdit, contractFee }: { clientId: string; initial: ServiceRow[]; canEdit: boolean; contractFee: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const set = (i: number, patch: Partial<ServiceRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await api(`/clients/${clientId}/services`, { method: "PUT", json: { rules: rows.map((r) => ({ service: r.service, enabled: r.enabled, part: r.part, feeType: r.feeType, feeValue: r.feeType === "CONTRACT" ? null : r.feeValue || null })) } });
      toast.success(t("services.saved"));
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        const fe = e.fieldErrors();
        const byRow = Object.fromEntries(Object.entries(fe).map(([k, v]) => [Number(k.split(".")[1]), v]));
        if (Object.keys(byRow).length) setErrors(byRow);
        else toast.error(e.message);
      } else toast.error(t("form.failed"));
    } finally {
      setBusy(false);
    }
  }

  const group = (direct: boolean) => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.direct === direct);
  const partOptions = [
    { value: "PAYROLL", label: t("services.part_PAYROLL") },
    { value: "EXPENSES", label: t("services.part_EXPENSES") },
  ];
  const feeOptions = [
    { value: "CONTRACT", label: contractFee ? t("services.fee_CONTRACT", { fee: contractFee }) : t("services.fee_CONTRACT_plain") },
    { value: "PERCENT", label: t("services.fee_PERCENT") },
    { value: "FIXED", label: t("services.fee_FIXED") },
  ];

  return (
    <div className="grid">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-xs text-muted">
              <th className="px-5 py-2.5 text-start font-medium">{t("services.service")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("services.show")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("services.invoice")}</th>
              <th className="px-3 py-2.5 text-start font-medium">{t("services.fee")}</th>
              <th className="px-5 py-2.5 text-start font-medium">{t("services.value")}</th>
            </tr>
          </thead>
          {[true, false].map((direct) => (
            <tbody key={String(direct)}>
              <tr>
                <th colSpan={5} className="eyebrow px-5 pb-1.5 pt-4 text-start">{t(direct ? "services.groupDirect" : "services.groupIndirect")}</th>
              </tr>
              {group(direct).map(({ r, i }) => (
                <tr key={r.service} className={cn("border-b border-border last:border-0", !r.enabled && "opacity-55")}>
                  <td className="px-5 py-2 font-medium">{t(`charges.${r.service}`)}</td>
                  <td className="px-3 py-2">
                    <Checkbox aria-label={t("services.showFor", { service: t(`charges.${r.service}`) })} checked={r.enabled} disabled={!canEdit} onCheckedChange={(c) => set(i, { enabled: c === true })} />
                  </td>
                  <td className="px-3 py-2">
                    <Select aria-label={t("services.invoice")} className="w-40" value={r.part} options={partOptions} onValueChange={(v) => canEdit && set(i, { part: v as ServiceRow["part"] })} />
                  </td>
                  <td className="px-3 py-2">
                    <Select aria-label={t("services.fee")} className="w-52" value={r.feeType} options={feeOptions} onValueChange={(v) => canEdit && set(i, { feeType: v as ServiceRow["feeType"] })} />
                  </td>
                  <td className="px-5 py-2">
                    {r.feeType === "CONTRACT" ? (
                      <span className="text-xs text-faint">—</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Input
                          dir="ltr"
                          inputMode="decimal"
                          className="w-28"
                          aria-label={t("services.value")}
                          aria-invalid={!!errors[i]}
                          disabled={!canEdit}
                          value={r.feeValue}
                          onChange={(e) => set(i, { feeValue: e.target.value })}
                        />
                        <span className="text-xs text-muted">{r.feeType === "PERCENT" ? "%" : t("services.perEmployee")}</span>
                      </span>
                    )}
                    {errors[i] && <p className="mt-1 text-xs text-danger">{errors[i]}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          {dirty && <span className="me-auto text-xs text-muted">{t("services.unsaved")}</span>}
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setRows(initial)}>
            {t("common.discard")}
          </Button>
          <Button loading={busy} disabled={!dirty} onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
