"use client";

import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";

interface Row {
  rowNo: number;
  result: string;
  errors: { path: string; message: string }[] | null;
  employeeNo: string | null;
  name: string | null;
  classification: string | null;
  clientCode: string | null;
}
interface Job {
  id: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  rows: Row[];
}

/** Upload, review row by row, then commit. Nothing touches employees until the last step. */
export function ImportWizard() {
  const t = useTranslations();
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("form.failed"));

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const { id } = await api<{ id: string }>("/imports/employees", { method: "POST", body: form });
      setJob(await api<Job>(`/imports/${id}`));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!job) return;
    setBusy(true);
    try {
      setDone(await api(`/imports/${job.id}/commit`, { method: "POST", json: {} }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Panel className="flex flex-col items-center gap-3 py-14 text-center">
        <CheckCircle2 className="size-9 text-success" strokeWidth={1.5} />
        <p className="text-base font-semibold">{t("employees.importDone", { created: done.created, updated: done.updated })}</p>
        <Button asChild variant="secondary"><Link href="/employees">{t("employees.title")}</Link></Button>
      </Panel>
    );
  }

  if (!job) {
    return (
      <Panel className="grid gap-5 p-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="size-4 text-primary" strokeWidth={1.75} /> {t("employees.step1")}</h2>
          <p className="text-sm text-muted">{t("employees.step1Body")}</p>
          <Button asChild variant="secondary" className="w-fit"><a href="/api/v1/imports/employees/template"><Download /> {t("employees.template")}</a></Button>
        </div>
        <label className={cn("grid cursor-pointer place-items-center gap-2 rounded-lg border border-dashed border-border-strong p-8 text-center transition-colors hover:bg-surface-2", busy && "pointer-events-none opacity-60")}>
          <Upload className="size-6 text-muted" strokeWidth={1.5} />
          <span className="text-sm font-medium">{t(busy ? "employees.checking" : "employees.chooseXlsx")}</span>
          <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title={t("employees.review")}
        description={t("employees.reviewSummary", { ok: job.okRows, errors: job.errorRows })}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setJob(null)}>{t("common.cancel")}</Button>
            <Button size="sm" loading={busy} disabled={job.okRows === 0} onClick={commit}>{t("employees.commit", { count: job.okRows })}</Button>
          </div>
        }
      />
      <div className="table-scroll">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border">
              {["#", t("employees.employeeNo"), t("employees.nameEn"), t("employees.classification"), t("employees.client"), t("employees.result")].map((h) => (
                <th key={h} className="eyebrow bg-surface-2/60 px-4 py-2 text-start first:ps-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {job.rows.map((r) => (
              <tr key={r.rowNo} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2 ps-5 text-faint num">{r.rowNo}</td>
                <td className="px-4 py-2"><bdi className="font-mono text-xs">{r.employeeNo ?? "—"}</bdi></td>
                <td className="px-4 py-2">{r.name ?? "—"}</td>
                <td className="px-4 py-2">{r.classification ?? "—"}</td>
                <td className="px-4 py-2"><bdi className="font-mono text-xs">{r.clientCode ?? "—"}</bdi></td>
                <td className="px-4 py-2">
                  {r.errors ? (
                    <ul className="grid gap-0.5 text-xs text-danger">
                      {r.errors.map((e, i) => (
                        <li key={i}><bdi className="font-mono">{e.path}</bdi>: {t.has(e.message) ? t(e.message) : e.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <Badge tone={r.result === "update" ? "info" : "success"}>{t(`employees.result_${r.result}`)}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
