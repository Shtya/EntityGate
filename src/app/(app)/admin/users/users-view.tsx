"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Copy, KeyRound, Plus, Search, ShieldCheck, UserX, UserCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { createUserSchema, type CreateUserInput } from "@/server/modules/users/schema";
import { DataTable } from "@/components/patterns/data-table";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, SheetContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Avatar, Badge, Panel } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { UserPermissions, type Override } from "./user-permissions";

interface Role {
  key: string;
  requiresMfa: boolean;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
  overrides: Override[];
}

const STATUS_TONE = { ACTIVE: "success", SUSPENDED: "warning", DEACTIVATED: "neutral" } as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;

export function UsersView({
  rolePermissions,
  users,
  roles,
  canManage,
  currentUserId,
  filter,
}: {
  users: UserRow[];
  roles: Role[];
  canManage: boolean;
  currentUserId: string;
  filter: { q: string; status: string };
  rolePermissions: Record<string, string[]>;
}) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filter.q);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ email: string; password: string; title: string } | null>(null);
  const selected = users.find((u) => u.id === selectedId) ?? null;

  // Debounced URL-driven search keeps filters shareable and server-rendered.
  useEffect(() => {
    if (q === filter.q) return;
    const t = setTimeout(() => setFilter({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setFilter(next: Partial<typeof filter>) {
    const p = new URLSearchParams();
    const merged = { ...filter, ...next };
    if (merged.q) p.set("q", merged.q);
    if (merged.status) p.set("status", merged.status);
    startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ""}`));
  }

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: t("users.columnUser"),
        accessorFn: (u) => u.name,
        cell: ({ row: { original: u } }) => (
          <div className="flex items-center gap-3">
            <Avatar name={u.name} size={30} />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {u.name}
                {u.id === currentUserId && <span className="ms-1.5 text-xs font-normal text-faint">({t("common.you")})</span>}
              </p>
              <p className="truncate text-xs text-muted"><bdi>{u.email}</bdi></p>
            </div>
          </div>
        ),
      },
      {
        id: "roles",
        header: t("users.columnRoles"),
        enableSorting: false,
        cell: ({ row: { original: u } }) => (
          <div className="flex flex-wrap gap-1">
            {u.roles.map((r) => (
              <Badge key={r} tone="primary">
                {t(`roles.${r}`)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "mfa",
        header: t("users.column2fa"),
        accessorFn: (u) => u.twoFactorEnabled,
        meta: { hideOnMobile: true, align: "center", width: "64px" },
        cell: ({ row: { original: u } }) =>
          u.twoFactorEnabled ? <ShieldCheck className="mx-auto size-4 text-success" strokeWidth={1.75} aria-label={t("users.enabled")} /> : <span className="text-faint">—</span>,
      },
      {
        id: "lastLogin",
        header: t("users.columnLastLogin"),
        accessorFn: (u) => u.lastLoginAt ?? "",
        meta: { hideOnMobile: true },
        cell: ({ row: { original: u } }) => (
          <span className="whitespace-nowrap text-muted num">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : t("common.never")}</span>
        ),
      },
      {
        id: "status",
        header: t("users.columnStatus"),
        accessorFn: (u) => u.status,
        meta: { width: "120px" },
        cell: ({ row: { original: u } }) => (
          <Badge tone={STATUS_TONE[u.status]} dot>
            {t(`userStatus.${u.status}`)}
          </Badge>
        ),
      },
    ],
    [currentUserId, t, f],
  );

  return (
    <>
      <PageHeader
        eyebrow={t("users.eyebrow")}
        title={t("users.title")}
        description={t("users.description")}
        actions={
          canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t("users.add")}
            </Button>
          )
        }
      />
      <Panel>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("users.search")} className="ps-8" aria-label={t("users.search")} />
          </div>
          <Select
            aria-label={t("users.filterStatus")}
            value={filter.status}
            onValueChange={(v) => setFilter({ status: v })}
            allLabel={t("users.allStatuses")}
            options={STATUSES.map((value) => ({ value, label: t(`userStatus.${value}`) }))}
            className="sm:w-44"
          />
          <p className="text-xs text-muted sm:ms-auto num">
            {t("users.count", { count: users.length })}
          </p>
        </div>
        <div className={cn("transition-opacity", pending && "opacity-60")}>
          <DataTable
            columns={columns}
            data={users}
            rowKey={(u) => u.id}
            onRowClick={(u) => setSelectedId(u.id)}
            empty={<EmptyState title={t("users.emptyTitle")} description={t("users.emptyBody")} />}
          />
        </div>
      </Panel>

      {canManage && (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          roles={roles}
          onCreated={(email, password) => {
            setCreateOpen(false);
            setSecret({ email, password, title: t("users.created") });
            router.refresh();
          }}
        />
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        {selected && (
          <UserSheet
            rolePermissions={rolePermissions}
            user={selected}
            roles={roles}
            canManage={canManage}
            isSelf={selected.id === currentUserId}
            onChanged={() => router.refresh()}
            onPasswordReset={(password) => setSecret({ email: selected.email, password, title: t("users.passwordReset") })}
          />
        )}
      </Dialog>

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        {secret && <SecretDialog {...secret} />}
      </Dialog>
    </>
  );
}

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations();
  return (
    <div className="grid gap-px overflow-hidden rounded-md border border-border">
      {roles.map((r) => {
        const checked = value.includes(r.key);
        return (
          <label key={r.key} className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2/60", checked && "bg-primary-soft/40")}>
            <Checkbox
              className="mt-0.5"
              checked={checked}
              onCheckedChange={(c) => onChange(c ? [...value, r.key] : value.filter((k) => k !== r.key))}
            />
            <span className="grid gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {t(`roles.${r.key}`)}
                {r.requiresMfa && <Badge tone="accent">{t("users.mfaBadge")}</Badge>}
              </span>
              <span className="text-xs text-muted">{t(`roleDescriptions.${r.key}`)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Role[];
  onCreated: (email: string, password: string) => void;
}) {
  const t = useTranslations();
  const msg = (m?: string) => (m && t.has(m) ? t(m) : m);
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", email: "", title: "", phone: "", roles: [] },
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await api<{ user: { email: string }; temporaryPassword: string }>("/users", { method: "POST", json: values });
      onCreated(res.user.email, res.temporaryPassword);
    } catch (e) {
      if (e instanceof ApiError) {
        const fields = e.fieldErrors();
        if (Object.keys(fields).length) {
          for (const [k, m] of Object.entries(fields)) setError(k as keyof CreateUserInput, { message: m });
        } else if (e.code === "CONFLICT") setError("email", { message: e.message });
        else toast.error(e.message);
      } else toast.error(t("users.createFailed"));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={t("users.createTitle")} description={t("users.createBody")}>
        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="max-h-[62vh] overflow-y-auto">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("users.fullName")} htmlFor="name" error={msg(errors.name?.message)}>
                <Input id="name" autoFocus aria-invalid={!!errors.name} {...register("name")} />
              </Field>
              <Field label={t("users.workEmail")} htmlFor="email" error={msg(errors.email?.message)}>
                <Input id="email" type="email" dir="ltr" aria-invalid={!!errors.email} {...register("email")} />
              </Field>
              <Field label={t("users.jobTitle")} htmlFor="title" optional>
                <Input id="title" {...register("title")} />
              </Field>
              <Field label={t("users.phone")} htmlFor="phone" optional>
                <Input id="phone" type="tel" dir="ltr" {...register("phone")} />
              </Field>
            </div>
            <Field label={t("users.roles")} error={msg(errors.roles?.message)}>
              <Controller control={control} name="roles" render={({ field }) => <RolePicker roles={roles} value={field.value} onChange={field.onChange} />} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {t("users.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserSheet({
  rolePermissions,
  user,
  roles,
  canManage,
  isSelf,
  onChanged,
  onPasswordReset,
}: {
  user: UserRow;
  roles: Role[];
  canManage: boolean;
  isSelf: boolean;
  rolePermissions: Record<string, string[]>;
  onChanged: () => void;
  onPasswordReset: (password: string) => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  const [selectedRoles, setSelectedRoles] = useState(user.roles);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = selectedRoles.slice().sort().join() !== user.roles.slice().sort().join();
  useEffect(() => setSelectedRoles(user.roles), [user.roles]);

  async function patch(body: Record<string, unknown>, key: string, ok: string) {
    setBusy(key);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", json: body });
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("users.updateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword() {
    setBusy("reset");
    try {
      const res = await api<{ temporaryPassword: string }>(`/users/${user.id}/reset-password`, { method: "POST" });
      onPasswordReset(res.temporaryPassword);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("users.resetFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetContent title={user.name} description={user.email}>
      <div className="grid gap-6 p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Meta label={t("users.status")}>
            <Badge tone={STATUS_TONE[user.status]} dot>
              {t(`userStatus.${user.status}`)}
            </Badge>
          </Meta>
          <Meta label={t("users.twoFactor")}>{t(user.twoFactorEnabled ? "users.enabled" : "users.notSetUp")}</Meta>
          <Meta label={t("users.titleLabel")}>{user.title ?? "—"}</Meta>
          <Meta label={t("users.phone")}><bdi>{user.phone ?? "—"}</bdi></Meta>
          <Meta label={t("users.lastSignIn")}>{user.lastLoginAt ? f.dateTime(user.lastLoginAt) : t("common.never")}</Meta>
          <Meta label={t("users.createdAt")}>{f.date(user.createdAt)}</Meta>
        </dl>

        <section className="grid gap-2">
          <h3 className="eyebrow">{t("users.roles")}</h3>
          {canManage ? (
            <>
              <RolePicker roles={roles} value={selectedRoles} onChange={setSelectedRoles} />
              {dirty && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRoles(user.roles)}>
                    {t("common.discard")}
                  </Button>
                  <Button size="sm" loading={busy === "roles"} disabled={selectedRoles.length === 0} onClick={() => patch({ roles: selectedRoles }, "roles", t("users.rolesUpdated"))}>
                    {t("users.saveRoles")}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r} tone="primary">
                  {t(`roles.${r}`)}
                </Badge>
              ))}
            </div>
          )}
        </section>

        {canManage && !isSelf && (
          <section className="grid gap-2">
            <h3 className="eyebrow">{t("access.title")}</h3>
            <p className="text-xs text-muted">{t("access.hint")}</p>
            <UserPermissions userId={user.id} roles={user.roles} rolePermissions={rolePermissions} overrides={user.overrides} onChanged={onChanged} />
          </section>
        )}

        {canManage && !isSelf && (
          <section className="grid gap-2">
            <h3 className="eyebrow">{t("users.access")}</h3>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <Action
                icon={<KeyRound />}
                title={t("users.resetTitle")}
                body={t("users.resetBody")}
                button={<Button variant="secondary" size="sm" loading={busy === "reset"} onClick={resetPassword}>{t("users.reset")}</Button>}
              />
              {user.status === "ACTIVE" ? (
                <Action
                  icon={<UserX />}
                  title={t("users.suspendTitle")}
                  body={t("users.suspendBody")}
                  button={<Button variant="secondary" size="sm" className="text-danger" loading={busy === "status"} onClick={() => patch({ status: "SUSPENDED" }, "status", t("users.suspended"))}>{t("users.suspend")}</Button>}
                />
              ) : (
                <Action
                  icon={<UserCheck />}
                  title={t("users.reactivateTitle")}
                  body={t("users.reactivateBody")}
                  button={<Button variant="secondary" size="sm" loading={busy === "status"} onClick={() => patch({ status: "ACTIVE" }, "status", t("users.reactivated"))}>{t("users.reactivate")}</Button>}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </SheetContent>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="num">{children}</dd>
    </div>
  );
}

function Action({ icon, title, body, button }: { icon: React.ReactNode; title: string; body: string; button: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted [&_svg]:size-4 [&_svg]:stroke-[1.75]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{body}</p>
      </div>
      {button}
    </div>
  );
}

function SecretDialog({ email, password, title }: { email: string; password: string; title: string }) {
  const t = useTranslations("users");
  const [copied, setCopied] = useState(false);
  return (
    <DialogContent title={title} description={t("secretBody")}>
      <DialogBody>
        <div className="grid gap-1 text-sm">
          <span className="text-xs text-faint">{t("email")}</span>
          <bdi>{email}</bdi>
        </div>
        <div dir="ltr" className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-4 py-3">
          <code className="select-all font-mono text-base tracking-wide">{password}</code>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("copyPassword")}
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
      </DialogBody>
    </DialogContent>
  );
}
