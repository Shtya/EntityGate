"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PERMISSION_GROUPS } from "@/server/rbac/catalog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";

type Effect = "ALLOW" | "DENY";
export interface Override {
  permission: string;
  effect: Effect;
}

/**
 * Each permission has three states: follow the role, always allow, always block.
 * The first state shows what the role currently gives, so nobody has to cross-check the matrix.
 */
export function UserPermissions({
  userId,
  roles,
  rolePermissions,
  overrides,
  onChanged,
}: {
  userId: string;
  roles: string[];
  rolePermissions: Record<string, string[]>;
  overrides: Override[];
  onChanged: () => void;
}) {
  const t = useTranslations();
  const toMap = (list: Override[]) => new Map(list.map((o) => [o.permission, o.effect]));
  const [draft, setDraft] = useState(() => toMap(overrides));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(toMap(overrides)), [overrides]);

  const fromRoles = useMemo(() => new Set(roles.flatMap((r) => rolePermissions[r] ?? [])), [roles, rolePermissions]);
  const saved = useMemo(() => toMap(overrides), [overrides]);
  const dirty = draft.size !== saved.size || [...draft].some(([k, v]) => saved.get(k) !== v);

  if (roles.includes("ADMIN")) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted">
        <Lock className="size-4 shrink-0" strokeWidth={1.75} /> {t("access.adminAll")}
      </p>
    );
  }

  const set = (permission: string, effect: Effect | null) =>
    setDraft((current) => {
      const next = new Map(current);
      if (effect) next.set(permission, effect);
      else next.delete(permission);
      return next;
    });

  async function save() {
    setBusy(true);
    try {
      await api(`/users/${userId}/permissions`, {
        method: "PUT",
        json: { overrides: [...draft].map(([permission, effect]) => ({ permission, effect })) },
      });
      toast.success(t("access.saved"));
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("access.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="overflow-hidden rounded-md border border-border">
        {PERMISSION_GROUPS.map((g) => {
          const count = g.permissions.filter((p) => draft.has(p)).length;
          return (
            <details key={g.key} open={g.key === "pages"} className="group border-b border-border last:border-0">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-3.5 text-muted transition-transform group-open:rotate-180" />
                <span className="flex-1">{t(`rolesPage.groups.${g.key}`)}</span>
                {count > 0 && <Badge tone="accent">{t("access.customized", { count })}</Badge>}
              </summary>
              <ul className="border-t border-border">
                {g.permissions.map((p) => {
                  const effect = draft.get(p) ?? null;
                  const inherited = fromRoles.has(p);
                  return (
                    <li key={p} className="grid gap-1.5 border-b border-border px-3 py-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">{t(`permissions.${p}`)}</p>
                        {!effect && <p className="text-xs text-muted">{t(inherited ? "access.fromRoleAllowed" : "access.fromRoleBlocked")}</p>}
                      </div>
                      <div role="radiogroup" aria-label={t(`permissions.${p}`)} className="inline-flex justify-self-start rounded-md bg-surface-2 p-0.5">
                        <Segment active={!effect} onClick={() => set(p, null)} label={t("access.useRole")} />
                        <Segment active={effect === "ALLOW"} tone="success" onClick={() => set(p, "ALLOW")} label={t("access.allow")} />
                        <Segment active={effect === "DENY"} tone="danger" onClick={() => set(p, "DENY")} label={t("access.deny")} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
      {dirty && (
        <div className="glass sticky bottom-3 flex justify-end gap-2 rounded-lg p-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(saved)}>
            {t("common.discard")}
          </Button>
          <Button size="sm" loading={busy} onClick={save}>
            {t("access.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Segment({ active, tone, onClick, label }: { active: boolean; tone?: "success" | "danger"; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "h-6 rounded-[calc(var(--radius-control)-2px)] px-2 text-xs transition-colors",
        !active && "text-muted hover:text-fg",
        active && !tone && "bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--border-card)]",
        active && tone === "success" && "bg-success-soft font-medium text-success",
        active && tone === "danger" && "bg-danger-soft font-medium text-danger",
      )}
    >
      {label}
    </button>
  );
}
