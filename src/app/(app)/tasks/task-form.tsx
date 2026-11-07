"use client";

import { Building2, Check, Lock, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Label } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, type Option } from "@/components/ui/select";

export interface TaskFormValues {
  type: "CLIENT" | "INTERNAL";
  categoryIds: string[];
  title: string;
  description: string;
  clientId: string;
  employeeIds: string[];
  ownerId: string;
  onlyMe: boolean;
  hrRepId: string;
  accountManagerId: string;
  clientEmail: string;
  priority: string;
  status: string;
  holdReason: string;
  dueAt: string;
  recurrence: string;
  financeRequired: boolean;
}

export interface TaskFormOptions {
  categories: { id: string; name: string }[];
  users: Option[];
  clients: Option[];
  employees: Option[];
  priorities: Option[];
  statuses: Option[];
  recurrences: Option[];
  meId: string;
  /** Client-side default for a new task's due date (yyyy-mm-dd). */
  defaultDue: string;
}

const titleFrom = (ids: string[], categories: TaskFormOptions["categories"]) =>
  ids.map((id) => categories.find((c) => c.id === id)?.name).filter(Boolean).join(" - ");

/**
 * Create or edit a task. Picking categories fills the title with their names, as the client's old
 * system did, until the person types their own; clearing the title goes back to the automatic name.
 */
export function TaskFormButton({
  label,
  title,
  endpoint,
  method = "POST",
  initial,
  options,
  variant,
  size,
  icon = true,
}: {
  label: string;
  title: string;
  endpoint: string;
  method?: "POST" | "PUT";
  initial?: Partial<TaskFormValues>;
  options: TaskFormOptions;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const blank = useMemo<TaskFormValues>(
    () => ({
      type: "CLIENT",
      categoryIds: [],
      description: "",
      clientId: "",
      employeeIds: [],
      ownerId: "",
      onlyMe: false,
      hrRepId: "",
      accountManagerId: "",
      clientEmail: "",
      priority: "MEDIUM",
      status: "TODO",
      holdReason: "",
      dueAt: options.defaultDue,
      recurrence: "NONE",
      financeRequired: false,
      ...initial,
      title: initial?.title || titleFrom(initial?.categoryIds ?? [], options.categories),
    }),
    [initial, options.defaultDue, options.categories],
  );
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<TaskFormValues>(blank);
  const [titleTouched, setTitleTouched] = useState(Boolean(initial?.title));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV(blank);
    setTitleTouched(Boolean(initial?.title));
    setErrors({});
  }, [open, blank, initial?.title]);

  const set = <K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) => setV((s) => ({ ...s, [key]: value }));

  function toggleCategory(id: string) {
    setV((s) => {
      const categoryIds = s.categoryIds.includes(id) ? s.categoryIds.filter((x) => x !== id) : [...s.categoryIds, id];
      return { ...s, categoryIds, title: titleTouched ? s.title : titleFrom(categoryIds, options.categories) };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const blankToNull = (x: string) => (x.trim() === "" ? null : x);
    const json = {
      type: v.type,
      categoryIds: v.categoryIds,
      title: v.title,
      description: blankToNull(v.description),
      clientId: blankToNull(v.clientId),
      employeeIds: v.employeeIds,
      ownerId: v.onlyMe ? options.meId : blankToNull(v.ownerId),
      onlyMe: v.onlyMe,
      hrRepId: blankToNull(v.hrRepId),
      accountManagerId: v.type === "CLIENT" ? blankToNull(v.accountManagerId) : null,
      clientEmail: blankToNull(v.clientEmail),
      priority: v.priority,
      status: method === "POST" ? v.status : undefined,
      holdReason: v.status === "BLOCKED" ? blankToNull(v.holdReason) : null,
      dueAt: blankToNull(v.dueAt),
      recurrence: v.recurrence,
      financeRequired: v.financeRequired,
    };
    try {
      const res = await api<{ id: string }>(endpoint, { method, json });
      toast.success(t(method === "POST" ? "tasks.created" : "tasks.saved"));
      setOpen(false);
      if (method === "POST") router.push(`/tasks/${res.id}`);
      else router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fe = err.fieldErrors();
        if (Object.keys(fe).length) setErrors(fe);
        else toast.error(err.message);
      } else toast.error(t("form.failed"));
    } finally {
      setBusy(false);
    }
  }

  const isClient = v.type === "CLIENT";
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {icon && <Plus />} {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={title} description={t("tasks.formHint")} className="top-[4vh] max-w-4xl">
          <form onSubmit={submit} noValidate>
            <div className="scroll-thin grid max-h-[74vh] gap-6 overflow-y-auto px-5 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              {/* What: the services and the name */}
              <section className="grid content-start gap-4">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1" role="radiogroup" aria-label={t("tasks.type")}>
                  {(["CLIENT", "INTERNAL"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={v.type === k}
                      onClick={() => set("type", k)}
                      className={cn("flex h-9 items-center justify-center gap-2 rounded-md text-sm transition-colors", v.type === k ? "bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--border-card)]" : "text-muted hover:text-fg")}
                    >
                      {k === "CLIENT" ? <Building2 className="size-4" strokeWidth={1.75} /> : <Users className="size-4" strokeWidth={1.75} />}
                      {t(`enums.TaskKind.${k}`)}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label>{t("tasks.categories")}</Label>
                    {v.categoryIds.length > 0 && <span className="text-xs text-muted num">{t("tasks.categoriesChosen", { count: v.categoryIds.length })}</span>}
                  </div>
                  {options.categories.length ? (
                    <div className="scroll-thin grid max-h-60 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
                      {options.categories.map((c) => {
                        const on = v.categoryIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleCategory(c.id)}
                            className={cn(
                              "relative flex min-h-12 items-center rounded-lg border px-3 py-2 text-start text-[13px] leading-snug transition-colors",
                              on ? "border-primary bg-primary-soft font-medium text-fg" : "border-border bg-surface hover:border-border-strong hover:bg-surface-2",
                            )}
                          >
                            <span dir="auto" className="line-clamp-2 w-full pe-4 text-start">{c.name}</span>
                            {on && <Check className="absolute end-2 top-2 size-3.5 text-primary" strokeWidth={2.5} />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">{t("tasks.noCategories")}</p>
                  )}
                  {errors.categoryIds && <p className="text-xs text-danger">{errors.categoryIds}</p>}
                </div>

                <Field label={t("tasks.taskTitle")} htmlFor="task-title" error={errors.title} hint={titleTouched ? undefined : t("tasks.titleAuto")}>
                  <Input
                    id="task-title"
                    dir="auto"
                    value={v.title}
                    aria-invalid={!!errors.title}
                    placeholder={t("tasks.titlePlaceholder")}
                    onChange={(e) => {
                      const text = e.target.value;
                      setTitleTouched(text.trim() !== "");
                      set("title", text.trim() === "" ? titleFrom(v.categoryIds, options.categories) : text);
                    }}
                  />
                </Field>
                <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">{t("tasks.idReminder")}</p>
                <Field label={t("tasks.details")} htmlFor="task-desc" optional>
                  <Textarea id="task-desc" value={v.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
              </section>

              {/* Who, when and how */}
              <section className="grid content-start gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2" label={t("employees.client")} htmlFor="task-client" error={errors.clientId} optional>
                  <Select id="task-client" aria-label={t("employees.client")} className="w-full" value={v.clientId} onValueChange={(x) => set("clientId", x)} options={options.clients} allLabel={t("tasks.noClient")} searchable />
                </Field>
                <Field className="sm:col-span-2" label={t("tasks.employees")} htmlFor="task-emps" error={errors.employeeIds} optional>
                  <MultiSelect id="task-emps" aria-label={t("tasks.employees")} value={v.employeeIds} onValueChange={(x) => set("employeeIds", x)} options={options.employees} />
                </Field>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 sm:col-span-2">
                  <Checkbox className="mt-0.5" checked={v.onlyMe} onCheckedChange={(c) => set("onlyMe", c === true)} />
                  <span className="grid gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium"><Lock className="size-3.5" strokeWidth={1.75} /> {t("tasks.onlyMe")}</span>
                    <span className="text-xs text-muted">{t("tasks.onlyMeHint")}</span>
                  </span>
                </label>
                {!v.onlyMe && (
                  <Field className="sm:col-span-2" label={t("tasks.owner")} htmlFor="task-owner" error={errors.ownerId}>
                    <Select id="task-owner" aria-label={t("tasks.owner")} className="w-full" value={v.ownerId} onValueChange={(x) => set("ownerId", x)} options={options.users} searchable />
                  </Field>
                )}
                <Field className={isClient ? undefined : "sm:col-span-2"} label={t("tasks.hrRep")} htmlFor="task-hr" optional>
                  <Select id="task-hr" aria-label={t("tasks.hrRep")} className="w-full" value={v.hrRepId} onValueChange={(x) => set("hrRepId", x)} options={options.users} allLabel={t("tasks.nobody")} searchable />
                </Field>
                {isClient && (
                  <Field label={t("tasks.accountManager")} htmlFor="task-am" optional>
                    <Select id="task-am" aria-label={t("tasks.accountManager")} className="w-full" value={v.accountManagerId} onValueChange={(x) => set("accountManagerId", x)} options={options.users} allLabel={t("tasks.nobody")} searchable />
                  </Field>
                )}

                <Field label={t("tasks.priority")} htmlFor="task-priority">
                  <Select id="task-priority" aria-label={t("tasks.priority")} className="w-full" value={v.priority} onValueChange={(x) => set("priority", x)} options={options.priorities} />
                </Field>
                <Field label={t("tasks.due")} htmlFor="task-due" error={errors.dueAt} optional>
                  <DatePicker aria-label={t("tasks.due")} className="w-full" value={v.dueAt} onValueChange={(x) => set("dueAt", x)} />
                </Field>
                {method === "POST" && (
                  <Field className={v.status === "BLOCKED" ? undefined : "sm:col-span-2"} label={t("common.status")} htmlFor="task-status">
                    <Select id="task-status" aria-label={t("common.status")} className="w-full" value={v.status} onValueChange={(x) => set("status", x)} options={options.statuses} />
                  </Field>
                )}
                {method === "POST" && v.status === "BLOCKED" && (
                  <Field label={t("tasks.holdReason")} htmlFor="task-hold" error={errors.holdReason}>
                    <Input id="task-hold" value={v.holdReason} aria-invalid={!!errors.holdReason} onChange={(e) => set("holdReason", e.target.value)} />
                  </Field>
                )}
                <Field className="sm:col-span-2" label={t("tasks.clientEmail")} htmlFor="task-email" error={errors.clientEmail} optional>
                  <Input id="task-email" type="email" dir="ltr" value={v.clientEmail} placeholder="client@company.com" onChange={(e) => set("clientEmail", e.target.value)} />
                </Field>
                <Field label={t("tasks.repeat")} htmlFor="task-repeat">
                  <Select id="task-repeat" aria-label={t("tasks.repeat")} className="w-full" value={v.recurrence} onValueChange={(x) => set("recurrence", x)} options={options.recurrences} />
                </Field>
                <label className="flex cursor-pointer items-start gap-2.5 self-end rounded-lg border border-border p-3">
                  <Checkbox className="mt-0.5" checked={v.financeRequired} onCheckedChange={(c) => set("financeRequired", c === true)} />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{t("tasks.financeRequired")}</span>
                    <span className="text-xs text-muted">{t("tasks.financeRequiredHint")}</span>
                  </span>
                </label>
              </section>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={busy}>
                {method === "POST" ? t("tasks.add") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
