"use client";

import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, useState, useTransition } from "react";
import { useFormat } from "@/lib/use-format";
import { cn, shortIp } from "@/lib/utils";
import { TableFrame } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Avatar, Badge, Panel } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";

interface Item {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  ipAddress: string | null;
  actor: { name: string; email: string } | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
type Filter = { entityType: string; action: string; actorId: string; from: string; to: string };

const ACTION_TONE: Record<string, "danger" | "success" | "warning" | "info" | "neutral"> = {
  denied: "danger",
  upload_blocked: "danger",
  create: "success",
  login: "info",
  password_verified: "info",
  "status:suspended": "warning",
  password_reset: "warning",
  password_change: "warning",
  permissions_update: "warning",
};

export function AuditView({
  items,
  filter,
  facets,
  actors,
  nextCursor,
  cursor,
}: {
  items: Item[];
  filter: Filter;
  facets: { entityTypes: string[]; actions: string[] };
  actors: { id: string; name: string }[];
  nextCursor: string | null;
  cursor: string | null;
}) {
  const t = useTranslations();
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);

  const actionLabel = (a: string) => (t.has(`audit.actions.${a}`) ? t(`audit.actions.${a}`) : a);
  const entityLabel = (e: string) => (t.has(`audit.entities.${e}`) ? t(`audit.entities.${e}`) : e);

  const push = (next: Partial<Filter> & { cursor?: string }) => {
    const p = new URLSearchParams();
    const merged = { ...filter, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    start(() => router.push(`${pathname}${p.size ? `?${p}` : ""}`));
  };
  const active = Object.values(filter).some(Boolean);

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Select aria-label={t("audit.entity")} value={filter.entityType} onValueChange={(v) => push({ entityType: v })} allLabel={t("audit.allEntities")} options={facets.entityTypes.map((v) => ({ value: v, label: entityLabel(v) }))} className="w-40" />
        <Select aria-label={t("audit.action")} value={filter.action} onValueChange={(v) => push({ action: v })} allLabel={t("audit.allActions")} options={facets.actions.map((v) => ({ value: v, label: actionLabel(v) }))} className="w-44" />
        <Select aria-label={t("audit.user")} searchable value={filter.actorId} onValueChange={(v) => push({ actorId: v })} allLabel={t("audit.allUsers")} options={actors.map((a) => ({ value: a.id, label: a.name }))} className="w-48" />
        <DatePicker aria-label={t("audit.from")} placeholder={t("audit.from")} value={filter.from} onValueChange={(v) => push({ from: v })} className="w-40" />
        <DatePicker aria-label={t("audit.to")} placeholder={t("audit.to")} value={filter.to} onValueChange={(v) => push({ to: v })} className="w-40" />
        {active && (
          <Button variant="ghost" size="sm" onClick={() => start(() => router.push(pathname))}>
            <X /> {t("common.clear")}
          </Button>
        )}
      </div>

      <div className={cn("transition-opacity", pending && "opacity-60")}>
        <TableFrame
          footer={
            nextCursor || cursor ? (
              <div className="flex items-center justify-between px-5 py-2">
                {cursor ? (
                  <Link href={pathname + "?" + new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString()} className="text-xs font-medium text-primary hover:underline">
                    {t("audit.newest")}
                  </Link>
                ) : (
                  <span />
                )}
                {nextCursor && (
                  <Button variant="secondary" size="sm" onClick={() => push({ cursor: nextCursor })}>
                    {t("audit.older")}
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-start">
                <th className="w-8 py-2.5 ps-4" />
                <th className="eyebrow px-3 py-2.5 text-start">{t("audit.when")}</th>
                <th className="eyebrow px-3 py-2.5 text-start">{t("audit.who")}</th>
                <th className="eyebrow px-3 py-2.5 text-start">{t("audit.action")}</th>
                <th className="eyebrow px-3 py-2.5 text-start">{t("audit.record")}</th>
                <th className="eyebrow px-3 py-2.5 pe-5 text-start">{t("audit.ip")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const hasDetail = !!(e.before && Object.keys(e.before).length) || !!(e.after && Object.keys(e.after).length);
                const isOpen = open === e.id;
                const toggle = () => setOpen(isOpen ? null : e.id);
                return (
                  <Fragment key={e.id}>
                    <tr className={cn("border-b border-border", hasDetail && "cursor-pointer hover:bg-surface-2/60", isOpen && "bg-surface-2/60")} onClick={hasDetail ? toggle : undefined}>
                      <td className="py-2.5 ps-4 text-faint">
                        {hasDetail && (
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={t("audit.record")}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggle();
                            }}
                            className="grid size-5 place-items-center rounded"
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform rtl:-scale-x-100", isOpen && "rotate-90")} />
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted num">{f.dateTime(e.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar name={e.actor?.name ?? t("common.system")} size={22} />
                          <span className="truncate">{e.actor?.name ?? t("common.system")}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={ACTION_TONE[e.action] ?? "neutral"}>{actionLabel(e.action)}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-muted">{entityLabel(e.entityType)}</span>{" "}
                        <bdi className="font-mono text-xs text-faint">{e.entityId === "-" ? "" : e.entityId.slice(0, 10)}</bdi>
                      </td>
                      <td className="px-3 py-2.5 pe-5 font-mono text-xs text-faint">
                        <bdi>{shortIp(e.ipAddress)}</bdi>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-surface-2/40">
                        <td />
                        <td colSpan={5} className="px-3 pb-4 pt-1">
                          <ChangeTable before={e.before} after={e.after} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
        {items.length === 0 && <EmptyState title={t("audit.emptyTitle")} description={t(active ? "audit.emptyFiltered" : "audit.emptyAll")} />}
      </div>
    </Panel>
  );
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function ChangeTable({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const t = useTranslations("audit");
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-faint">
            <th className="px-3 py-1.5 text-start font-medium">{t("field")}</th>
            {before && <th className="px-3 py-1.5 text-start font-medium">{t("before")}</th>}
            <th className="px-3 py-1.5 text-start font-medium">{t(before ? "after" : "value")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-muted"><bdi>{k}</bdi></td>
              {before && <td className="px-3 py-1.5 font-mono text-danger/80 line-through decoration-danger/30"><bdi>{show(before[k])}</bdi></td>}
              <td className="px-3 py-1.5 font-mono"><bdi>{show(after?.[k])}</bdi></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
