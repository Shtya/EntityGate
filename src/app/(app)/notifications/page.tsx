import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { PAGE_SIZE } from "@/server/validation";
import { listNotifications, listNotificationsQuery } from "@/server/modules/notifications/service";
import { formatDateTime } from "@/lib/dates";
import { notificationText } from "@/components/patterns/notification-text";
import { ActionButton } from "@/components/patterns/form-dialog";
import { ListPager } from "@/components/patterns/list";
import { PageHeader } from "@/components/patterns/page-header";
import { PageTabs } from "@/components/patterns/record";
import { EmptyState } from "@/components/patterns/states";
import { Badge, Panel } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notifications"))("title") };
}

const TONE = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" } as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const actor = await getActor();
  const t = await getTranslations();
  const locale = await getLocale();
  const q = listNotificationsQuery.parse(await searchParams);
  const { rows, total, page } = await listNotifications(actor, q);

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} actions={<ActionButton size="md" label={t("notifications.markAllRead")} endpoint="/notifications/read-all" />} />
      <PageTabs
        active={q.view}
        tabs={[
          { key: "open", label: t("notifications.open"), href: "/notifications" },
          { key: "all", label: t("notifications.all"), href: "/notifications?view=all" },
        ]}
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title={t("notifications.empty")} description={t("notifications.emptyBody")} />
        ) : (
          <ul>
            {rows.map((n) => {
              const open = ["UNREAD", "READ", "SNOOZED"].includes(n.status);
              return (
                <li key={n.id} className="flex flex-col gap-3 border-b border-border px-5 py-3.5 last:border-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[n.severity]}>{t(`enums.Severity.${n.severity}`)}</Badge>
                      {n.status !== "UNREAD" && n.status !== "READ" && <Badge>{t(`enums.NotificationStatus.${n.status}`)}</Badge>}
                      <span className="text-xs text-faint num">{formatDateTime(n.createdAt, locale)}</span>
                    </div>
                    <p className={`mt-1 text-sm ${n.status === "UNREAD" ? "font-medium" : ""}`}>
                      {n.href ? <Link href={n.href} className="hover:text-primary hover:underline">{notificationText(t, n.title, n.body)}</Link> : notificationText(t, n.title, n.body)}
                    </p>
                  </div>
                  {open && (
                    <div className="flex shrink-0 gap-1.5">
                      <ActionButton variant="ghost" label={t("notifications.snooze")} endpoint={`/notifications/${n.id}`} json={{ action: "snooze", hours: 24 }} />
                      <ActionButton variant="secondary" label={t("notifications.ack")} endpoint={`/notifications/${n.id}`} json={{ action: "ack" }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {total > PAGE_SIZE && <div className="border-t border-border"><ListPager page={page} pageSize={PAGE_SIZE} total={total} /></div>}
      </Panel>
    </>
  );
}
