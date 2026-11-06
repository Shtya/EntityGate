"use client";

import { useTranslations } from "next-intl";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date | string;
  actor: { name: string } | null;
  after?: unknown;
}

const NO_OBJECT = ["login", "password_verified", "password_change", "upload_blocked"];

export function ActivityFeed({ items, className }: { items: ActivityItem[]; className?: string }) {
  const t = useTranslations();
  const f = useFormat();

  const describe = (e: ActivityItem) => {
    const verb = t.has(`activity.${e.action}`) ? t(`activity.${e.action}`) : e.action.replace(/[_:]/g, " ");
    if (NO_OBJECT.includes(e.action)) return verb;
    const after = (e.after ?? {}) as Record<string, unknown>;
    if (e.action === "denied") {
      const key = `permissions.${String(after.permission)}`;
      return `${verb}: ${t.has(key) ? t(key) : String(after.permission ?? "")}`;
    }
    const entity = t.has(`audit.entities.${e.entityType}`) ? t(`audit.entities.${e.entityType}`) : e.entityType;
    const label = (typeof after.name === "string" && after.name) || (typeof after.filename === "string" && after.filename) || "";
    return `${verb} ${entity} ${label}`.trim();
  };

  return (
    <ol className={cn("relative grid", className)}>
      {items.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 px-5 py-3">
          {i < items.length - 1 && <span className="absolute bottom-0 start-[32px] top-10 w-px bg-border" aria-hidden />}
          <Avatar name={e.actor?.name ?? t("activity.system")} size={26} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">
              <span className="font-medium">{e.actor?.name ?? t("activity.system")}</span>{" "}
              <span className={cn("text-muted", e.action === "denied" && "text-danger")}>{describe(e)}</span>
            </p>
            <p className="mt-0.5 text-xs text-faint num">{f.dateTime(e.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
