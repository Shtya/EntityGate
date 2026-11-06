"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from "@/server/rbac/catalog";
import { TableFrame } from "@/components/patterns/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tip } from "@/components/ui/menu";
import { Badge, Panel } from "@/components/ui/misc";

interface RoleRow {
  key: string;
  requiresMfa: boolean;
  userCount: number;
  permissions: string[];
}

const ADMIN = "ADMIN";
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function RolesMatrix({
  roles,
  canManage,
  held,
  ownRoles,
  isAdmin,
}: {
  roles: RoleRow[];
  canManage: boolean;
  held: string[];
  ownRoles: string[];
  isAdmin: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const saved = useMemo(() => new Map(roles.map((r) => [r.key, new Set(r.key === ADMIN ? ALL_PERMISSIONS : r.permissions)])), [roles]);
  const [draft, setDraft] = useState<Map<string, Set<string>>>(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(saved), [saved]);

  const heldSet = useMemo(() => new Set(held), [held]);
  const changed = roles.filter((r) => !sameSet(saved.get(r.key)!, draft.get(r.key) ?? new Set()));

  const toggle = (roleKey: string, permission: string, on: boolean) =>
    setDraft((current) => {
      const next = new Map(current);
      const perms = new Set(next.get(roleKey));
      if (on) perms.add(permission);
      else perms.delete(permission);
      next.set(roleKey, perms);
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      for (const r of changed) {
        await api(`/roles/${r.key}/permissions`, { method: "PUT", json: { permissions: [...draft.get(r.key)!] } });
      }
      toast.success(t("access.saved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("access.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <TableFrame
        footer={
          changed.length > 0 ? (
            <div className="flex items-center justify-between gap-4 px-5 py-2.5">
              <p className="text-sm text-muted">{t("access.unsavedRoles", { count: changed.length })}</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(saved)}>
                  {t("common.discard")}
                </Button>
                <Button size="sm" loading={busy} onClick={save}>
                  {t("access.save")}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              <th className="eyebrow w-[300px] px-5 py-3 text-start">{t("rolesPage.permission")}</th>
              {roles.map((r) => (
                <th key={r.key} className="px-2 py-3 text-center align-bottom">
                  <div className="grid justify-items-center gap-1">
                    <span className="text-xs font-semibold leading-tight">{t(`roles.${r.key}`)}</span>
                    <span className="text-2xs font-normal text-faint num">{t("rolesPage.users", { count: r.userCount })}</span>
                    {r.key === ADMIN ? (
                      <Tip label={t("access.adminAll")}>
                        <span className="inline-flex" tabIndex={0}>
                          <Badge tone="accent">
                            <Lock className="size-2.5" /> {t("access.allAccess")}
                          </Badge>
                        </span>
                      </Tip>
                    ) : (
                      r.requiresMfa && <Badge tone="accent">{t("rolesPage.mfa")}</Badge>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => [
              <tr key={g.key}>
                <td colSpan={roles.length + 1} className="eyebrow border-b border-border bg-surface-2/30 px-5 pb-2 pt-5">
                  {t(`rolesPage.groups.${g.key}`)}
                </td>
              </tr>,
              ...g.permissions.map((k) => (
                <tr key={k} className="border-b border-border hover:bg-surface-2/50">
                  <td className="px-5 py-2">
                    <Tip label={<code dir="ltr" className="font-mono">{k}</code>}>
                      <span className="cursor-default">{t(`permissions.${k}`)}</span>
                    </Tip>
                  </td>
                  {roles.map((r) => {
                    const checked = draft.get(r.key)?.has(k) ?? false;
                    const locked =
                      !canManage ||
                      r.key === ADMIN ||
                      (!isAdmin && ownRoles.includes(r.key)) ||
                      (!isAdmin && !checked && !heldSet.has(k));
                    return (
                      <td key={r.key} className="px-2 py-2 text-center">
                        <span className="inline-grid place-items-center">
                          <Checkbox
                            checked={checked}
                            disabled={locked}
                            onCheckedChange={(v) => toggle(r.key, k, v === true)}
                            aria-label={`${t(`permissions.${k}`)}: ${t(`roles.${r.key}`)}`}
                          />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </TableFrame>
    </Panel>
  );
}
