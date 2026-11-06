"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, type Option } from "@/components/ui/select";

/** Uploading replaces that month's lines. A file with any bad row changes nothing. */
export function PayrollImport({ periods }: { periods: Option[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(periods[0].value);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<[string, string][]>([]);

  async function upload(file: File) {
    setBusy(true);
    setProblems([]);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("period", period);
      const res = await api<{ id: string }>("/payroll/import", { method: "POST", body: form });
      setOpen(false);
      router.push(`/finance/payroll/${res.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        const rows = Object.entries(e.fieldErrors());
        if (rows.length) setProblems(rows);
        else toast.error(e.message);
      } else toast.error(t("form.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload /> {t("finance.import")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("finance.import")} description={t("finance.importHint")}>
          <DialogBody>
            <Field label={t("billing.month")} htmlFor="payroll-period">
              <Select id="payroll-period" aria-label={t("billing.month")} className="w-full" value={period} onValueChange={setPeriod} options={periods} />
            </Field>
            <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong text-sm text-muted hover:bg-surface-2">
              <Upload className="size-4" strokeWidth={1.75} />
              {busy ? t("finance.uploading") : t("form.chooseFile")}
              <input type="file" accept=".xlsx" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {problems.length > 0 && (
              <ul role="alert" className="max-h-40 overflow-y-auto rounded-md bg-danger/10 p-3 text-xs text-danger">
                {problems.map(([path, message]) => (
                  <li key={path}>
                    <bdi className="num">{t("finance.rowLabel", { row: path.replace("row_", "") })}</bdi>: {message}
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
          <DialogFooter>
            <Button asChild variant="ghost">
              <a href="/api/v1/payroll/template">
                <Download /> {t("finance.template")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
