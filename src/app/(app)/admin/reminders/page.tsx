import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { Forbidden } from "@/components/patterns/forbidden";
import { ActionButton, FormButton } from "@/components/patterns/form-dialog";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordTable } from "@/components/patterns/record";
import { Badge, Panel } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("reminders"))("title") };
}

export default async function RemindersPage() {
  const actor = await getActor();
  if (!can(actor, "reminder_rule:manage")) return <Forbidden />;
  const t = await getTranslations();
  const rules = await db.reminderRule.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        eyebrow={t("nav.system")}
        title={t("reminders.title")}
        description={t("reminders.description")}
        actions={<ActionButton size="md" label={t("reminders.runNow")} endpoint="/reminders/run" successMessage={t("reminders.ran")} />}
      />
      <Panel>
        <RecordTable
          rows={rules}
          rowKey={(r) => r.id}
          emptyTitle={t("reminders.title")}
          minWidth={760}
          columns={[
            { header: t("reminders.rule"), cell: (r) => <span className="font-medium">{t(`enums.ReminderTrigger.${r.trigger}`)}</span> },
            { header: t("reminders.when"), cell: (r) => <bdi className="font-mono text-xs">{r.offsetsDays.join(", ")}</bdi> },
            { header: t("reminders.channels"), cell: (r) => t(r.channels.includes("email") ? "reminders.inAppEmail" : "reminders.inApp") },
            { header: t("reminders.escalateAfter"), cell: (r) => (r.escalateAfterHours ? t("reminders.hours", { hours: r.escalateAfterHours }) : "—") },
            { header: t("common.status"), cell: (r) => <Badge tone={r.active ? "success" : "neutral"} dot>{t(r.active ? "reminders.on" : "reminders.off")}</Badge> },
            {
              header: "",
              align: "end",
              cell: (r) => (
                <FormButton
                  size="sm"
                  variant="secondary"
                  label={t("common.edit")}
                  title={t(`enums.ReminderTrigger.${r.trigger}`)}
                  endpoint={`/reminders/rules/${r.id}`}
                  method="PUT"
                  submitLabel={t("common.save")}
                  initial={{ offsets: r.offsetsDays.join(", "), email: r.channels.includes("email"), active: r.active, escalateAfterHours: r.escalateAfterHours ? String(r.escalateAfterHours) : "" }}
                  fields={[
                    { name: "offsets", label: t("reminders.when"), hint: t("reminders.whenHint"), required: true, ltr: true, wide: true },
                    { name: "escalateAfterHours", label: t("reminders.escalateAfter"), type: "number", hint: t("reminders.escalateHint"), wide: true },
                    { name: "email", label: t("reminders.sendEmail"), type: "checkbox" },
                    { name: "active", label: t("reminders.on"), type: "checkbox" },
                  ]}
                />
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
