import type { Metadata } from "next";
import { CheckCircle2, Eraser, ShieldCheck, Trash2 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { isAdmin } from "@/server/rbac/policy";
import { CONFIRM_PHRASE, systemStatus } from "@/server/modules/system/service";
import { formatDateTime } from "@/lib/dates";
import { Forbidden } from "@/components/patterns/forbidden";
import { FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { Panel, PanelHeader, StatTile } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav"))("settings") };
}

export default async function SystemSettingsPage() {
  const actor = await getActor();
  if (!isAdmin(actor)) return <Forbidden />;
  const t = await getTranslations("system");
  const nav = await getTranslations("nav");
  const locale = await getLocale();
  const status = await systemStatus();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-[var(--card-gap)]">
      <PageHeader eyebrow={nav("system")} title={nav("settings")} description={t("description")} />
      {status.clearedAt ? (
        <Panel>
          <div className="flex items-start gap-3 p-5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.75} />
            <div>
              <p className="font-medium">{t("clearedTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("clearedBody", { name: status.clearedBy ?? "—", date: formatDateTime(status.clearedAt, locale) })}</p>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel className="border-danger/40">
          <PanelHeader title={t("clearTitle")} description={t("clearHint")} />
          <div className="grid gap-5 p-5 pt-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={t("clients")} value={status.clients} />
              <StatTile label={t("employees")} value={status.employees} />
              <StatTile label={t("invoices")} value={status.invoices} />
              <StatTile label={t("users")} value={status.users} />
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 font-medium"><Trash2 className="size-4 text-danger" strokeWidth={1.75} /> {t("removedTitle")}</p>
                <p className="mt-1 text-muted">{t("removedBody")}</p>
              </div>
              <div>
                <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4 text-success" strokeWidth={1.75} /> {t("keptTitle")}</p>
                <p className="mt-1 text-muted">{t("keptBody", { email: actor.email })}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="flex items-center gap-1.5 text-xs text-muted"><Eraser className="size-3.5 shrink-0" strokeWidth={1.75} /> {t("onceOnly")}</p>
              <FormButton
                variant="danger"
                label={t("clearButton")}
                title={t("clearConfirmTitle")}
                description={t("clearConfirmBody")}
                endpoint="/system/clear-data"
                submitLabel={t("clearButton")}
                successMessage={t("clearedToast")}
                redirectTo="/"
                fields={[
                  { name: "confirm", label: t("typePhraseLabel", { phrase: CONFIRM_PHRASE }), required: true, ltr: true, wide: true },
                  { name: "password", label: t("yourPassword"), type: "password", required: true, ltr: true, wide: true },
                ]}
              />
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
