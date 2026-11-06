import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { REPORTS } from "@/server/modules/reports/definitions";
import { Forbidden } from "@/components/patterns/forbidden";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Panel } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("reports") };
}

export default async function ReportsPage() {
  const actor = await getActor();
  if (!can(actor, "report:read")) return <Forbidden />;
  const t = await getTranslations();
  const visible = REPORTS.filter((r) => can(actor, r.permission));
  return (
    <>
      <PageHeader eyebrow={t("nav.system")} title={t("reports.title")} description={t("reports.description")} />
      {visible.length ? (
        <div className="card-grid sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => (
            <Link key={r.key} href={`/reports/${r.key}`} className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Panel className="h-full p-5 transition-colors group-hover:bg-surface-2">
                <p className="flex items-center justify-between gap-2 font-medium">
                  {t(`reports.name_${r.key}`)}
                  <ArrowUpRight className="size-4 shrink-0 text-faint group-hover:text-primary rtl:-scale-x-100" strokeWidth={1.75} />
                </p>
                <p className="mt-1 text-sm text-muted">{t(`reports.hint_${r.key}`)}</p>
              </Panel>
            </Link>
          ))}
        </div>
      ) : (
        <Panel>
          <EmptyState title={t("reports.noneTitle")} description={t("reports.noneBody")} />
        </Panel>
      )}
    </>
  );
}
