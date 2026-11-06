import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { PageHeader } from "@/components/patterns/page-header";
import { PasswordPanel } from "./password-panel";
import { TwoFactorPanel } from "./two-factor-panel";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("security") };
}

export default async function SecurityPage() {
  const t = await getTranslations("security");
  const actor = await getActor();
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-[var(--card-gap)]">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <TwoFactorPanel enabled={actor.twoFactorEnabled} required={actor.mfaRequired} />
      <PasswordPanel />
    </div>
  );
}
