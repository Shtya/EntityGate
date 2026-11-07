"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, type Option } from "@/components/ui/select";

export interface FieldSpec {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "password" | "number" | "money" | "date" | "select" | "textarea" | "checkbox" | "file";
  options?: Option[];
  required?: boolean;
  hint?: string;
  /** Full row in the two-column layout. */
  wide?: boolean;
  /** LTR content in an RTL page: codes, numbers, emails. */
  ltr?: boolean;
  allLabel?: string;
}

export type FormValues = Record<string, string | boolean | null>;

/**
 * Declarative create/edit form. Validation lives on the server (one set of rules);
 * field errors come back from the API and land on the right input. Blank fields are sent as null.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  endpoint,
  method = "POST",
  submitLabel,
  successMessage,
  redirectTo,
  wide,
  hiddenValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: FieldSpec[];
  initial?: FormValues;
  endpoint: string;
  method?: "POST" | "PUT" | "PATCH";
  submitLabel: string;
  successMessage?: string;
  /** Opens the new record: "{id}" is replaced from the response. */
  redirectTo?: string;
  wide?: boolean;
  /** Sent with the form but not shown. */
  hiddenValues?: FormValues;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(initial ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setValues(initial ?? {});
      setErrors({});
      setFileNames({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, value: string | boolean | null) => setValues((v) => ({ ...v, [name]: value }));

  async function upload(name: string, file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await api<{ id: string; filename: string }>("/attachments", { method: "POST", body: form });
      set(name, res.id);
      setFileNames((f) => ({ ...f, [name]: res.filename }));
    } catch (e) {
      setErrors((x) => ({ ...x, [name]: e instanceof ApiError ? e.message : t("form.failed") }));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const json: FormValues = { ...hiddenValues };
    for (const f of fields) {
      const v = values[f.name];
      json[f.name] = f.type === "checkbox" ? v === true : v === "" || v === undefined ? null : v;
    }
    try {
      const res = await api<{ id?: string }>(endpoint, { method, json });
      if (successMessage) toast.success(successMessage);
      onOpenChange(false);
      if (redirectTo) router.push(redirectTo.replace("{id}", res?.id ?? ""));
      else router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.fieldErrors();
        if (Object.keys(fieldErrors).some((k) => fields.some((f) => f.name === k))) setErrors(fieldErrors);
        else toast.error(err.message);
      } else toast.error(t("form.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide={wide ?? fields.length > 4} title={title} description={description}>
        <form onSubmit={submit} noValidate>
          <DialogBody className="max-h-[66vh] overflow-y-auto sm:grid-cols-2">
            {fields.map((f) => {
              const value = values[f.name];
              const span = f.wide || f.type === "textarea" ? "sm:col-span-2" : undefined;
              if (f.type === "checkbox") {
                return (
                  <div key={f.name} className={cn("flex items-start gap-2 sm:pt-6", span)}>
                    <Checkbox id={f.name} className="mt-0.5" checked={value === true} onCheckedChange={(c) => set(f.name, c === true)} />
                    <div className="grid gap-0.5">
                      <Label htmlFor={f.name}>{f.label}</Label>
                      {f.hint && <p className="text-xs text-muted">{f.hint}</p>}
                    </div>
                  </div>
                );
              }
              return (
                <Field key={f.name} className={span} label={f.label} htmlFor={f.name} hint={f.hint} error={errors[f.name]} optional={!f.required}>
                  {f.type === "select" ? (
                    <Select id={f.name} aria-label={f.label} className="w-full" value={String(value ?? "")} onValueChange={(v) => set(f.name, v)} options={f.options ?? []} allLabel={f.allLabel} />
                  ) : f.type === "date" ? (
                    <DatePicker aria-label={f.label} className="w-full" value={String(value ?? "")} onValueChange={(v) => set(f.name, v)} />
                  ) : f.type === "textarea" ? (
                    <Textarea id={f.name} aria-invalid={!!errors[f.name]} value={String(value ?? "")} onChange={(e) => set(f.name, e.target.value)} />
                  ) : f.type === "file" ? (
                    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 text-sm text-muted hover:bg-surface-2">
                      <Paperclip className="size-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{fileNames[f.name] ?? t("form.chooseFile")}</span>
                      <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(f.name, e.target.files[0])} />
                    </label>
                  ) : (
                    <Input
                      id={f.name}
                      type={f.type === "email" || f.type === "tel" || f.type === "password" ? f.type : "text"}
                      autoComplete={f.type === "password" ? "current-password" : undefined}
                      inputMode={f.type === "money" ? "decimal" : f.type === "number" ? "numeric" : undefined}
                      dir={f.ltr || f.type === "email" || f.type === "tel" || f.type === "money" || f.type === "number" ? "ltr" : undefined}
                      aria-invalid={!!errors[f.name]}
                      value={String(value ?? "")}
                      onChange={(e) => set(f.name, e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A button that opens a form. Serializable props, so server pages can use it directly. */
export function FormButton({
  label,
  variant,
  size,
  ...form
}: Omit<React.ComponentProps<typeof FormDialog>, "open" | "onOpenChange"> & { label: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FormDialog open={open} onOpenChange={setOpen} {...form} />
    </>
  );
}

/** One-click API action with an optional confirmation step. */
export function ActionButton({
  label,
  endpoint,
  method = "POST",
  json,
  variant = "secondary",
  size = "sm",
  confirm,
  confirmBody,
  successMessage,
  redirectTo,
}: {
  label: string;
  endpoint: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  confirm?: string;
  confirmBody?: string;
  successMessage?: string;
  redirectTo?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await api(endpoint, { method, json: json ?? {} });
      if (successMessage) toast.success(successMessage);
      setAsking(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("form.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant={variant} size={size} loading={busy && !asking} onClick={() => (confirm ? setAsking(true) : void run())}>
        {label}
      </Button>
      {confirm && (
        <Dialog open={asking} onOpenChange={setAsking}>
          <DialogContent title={confirm} description={confirmBody}>
            <DialogFooter className="border-t-0">
              <Button variant="ghost" onClick={() => setAsking(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant={variant === "danger" ? "danger" : "primary"} loading={busy} onClick={() => void run()}>
                {label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
