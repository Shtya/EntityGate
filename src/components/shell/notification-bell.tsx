"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { notificationText } from "@/components/patterns/notification-text";

interface Row {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  severity: string;
  status: string;
  createdAt: string;
}

const DOT: Record<string, string> = { CRITICAL: "bg-danger", HIGH: "bg-warning", MEDIUM: "bg-info", LOW: "bg-faint" };

export function NotificationBell() {
  const t = useTranslations();
  const f = useFormat();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ rows: Row[]; unread: number }>("/notifications/recent"), refetchInterval: 60_000 });
  const unread = data?.unread ?? 0;

  const markRead = async (id: string) => {
    setOpen(false);
    await api(`/notifications/${id}`, { method: "POST", json: { action: "read" } }).catch(() => undefined);
    void client.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="relative grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label={t("notifications.title")}>
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {unread > 0 && <span className="absolute end-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white num">{unread > 99 ? "99+" : unread}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="glass z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-lg data-[state=open]:animate-pop-in">
          <div className="flex items-center justify-between border-b border-border-card px-4 py-2.5">
            <span className="text-sm font-semibold">{t("notifications.title")}</span>
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">{t("notifications.viewAll")}</Link>
          </div>
          {data?.rows.length ? (
            <ul className="scroll-thin max-h-96 overflow-y-auto">
              {data.rows.map((n) => (
                <li key={n.id} className="border-b border-border-card last:border-0">
                  <Link href={n.href ?? "/notifications"} onClick={() => void markRead(n.id)} className="flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--text)_6%,transparent)]">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[n.severity])} aria-hidden />
                    <span className="min-w-0">
                      <span className={cn("block text-sm leading-snug", n.status === "UNREAD" && "font-medium")}>{notificationText(t, n.title, n.body)}</span>
                      <span className="text-xs text-faint num">{f.dateTime(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted">{t("notifications.empty")}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
