import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns/page-header";
import { AppShell } from "@/components/shell/app-shell";
import { PageContainer } from "@/components/shell/main-well";
import { getActorOrNull } from "@/server/rbac/actor";
import { needsMfaEnrollment } from "@/server/rbac/policy";
import { PasswordPanel } from "./settings/security/password-panel";
import { TwoFactorPanel } from "./settings/security/two-factor-panel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const t = await getTranslations("setup");
  const collapsed = (await cookies()).get("eg-sidebar")?.value === "collapsed";

  return (
    <AppShell
      user={{ name: actor.name, email: actor.email, title: actor.title, roles: actor.roles }}
      permissions={[...actor.permissions]}
      initialCollapsed={collapsed}
    >
      <PageContainer>
        {/*
          Required security setup replaces the page in place rather than redirecting, so it holds on
          every URL and link prefetches can't loop. The page's server component never renders here,
          and /api/v1 enforces the same rules in apiRoute().
        */}
        {actor.mustChangePassword ? (
          <SetupStep eyebrow={t("eyebrow")} title={t("passwordTitle")} notice={t("passwordNotice")}>
            <PasswordPanel required />
          </SetupStep>
        ) : needsMfaEnrollment(actor) ? (
          <SetupStep eyebrow={t("eyebrow")} title={t("mfaTitle")} notice={t("mfaNotice")}>
            <TwoFactorPanel enabled={false} required />
          </SetupStep>
        ) : (
          children
        )}
      </PageContainer>
    </AppShell>
  );
}

function SetupStep({ eyebrow, title, notice, children }: { eyebrow: string; title: string; notice: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-[var(--card-gap)]">
      <PageHeader eyebrow={eyebrow} title={title} />
      <div role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
        {notice}
      </div>
      {children}
    </div>
  );
}
