import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { auditFacets, auditQuery, listAuditEvents } from "@/server/modules/audit/service";
import { db } from "@/server/db";
import { Forbidden } from "@/components/patterns/forbidden";
import { PageHeader } from "@/components/patterns/page-header";
import { AuditView } from "./audit-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("audit") };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await getActor();
  if (!can(actor, "audit:read")) return <Forbidden />;

  const t = await getTranslations("audit");
  const parsed = auditQuery.safeParse(await searchParams);
  const q = parsed.success ? parsed.data : auditQuery.parse({});
  const [page, facets, actors] = await Promise.all([
    listAuditEvents(q),
    auditFacets(),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <AuditView
        filter={{
          entityType: q.entityType ?? "",
          action: q.action ?? "",
          actorId: q.actorId ?? "",
          from: q.from ?? "",
          to: q.to ?? "",
        }}
        facets={facets}
        actors={actors}
        nextCursor={page.nextCursor}
        cursor={q.cursor ?? null}
        items={page.items.map((e) => ({
          id: e.id,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          createdAt: e.createdAt.toISOString(),
          ipAddress: e.ipAddress,
          actor: e.actor ? { name: e.actor.name, email: e.actor.email } : null,
          before: e.before as Record<string, unknown> | null,
          after: e.after as Record<string, unknown> | null,
        }))}
      />
    </>
  );
}
