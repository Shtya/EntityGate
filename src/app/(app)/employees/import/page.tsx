import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { Forbidden } from "@/components/patterns/forbidden";
import { PageHeader } from "@/components/patterns/page-header";
import { ImportWizard } from "./import-wizard";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("employees"))("import") };
}

export default async function ImportPage() {
  const actor = await getActor();
  if (!can(actor, "employee:import")) return <Forbidden />;
  const t = await getTranslations("employees");
  return (
    <>
      <PageHeader eyebrow={t("title")} title={t("import")} description={t("importHint")} />
      <ImportWizard />
    </>
  );
}
