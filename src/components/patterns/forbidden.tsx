import Link from "next/link";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { visibleNav } from "@/components/shell/nav";
import { getActor } from "@/server/rbac/actor";

export async function Forbidden() {
  const t = await getTranslations();
  const actor = await getActor();
  // Back to a page they can open. Security is always theirs, even with no pages granted.
  const home = visibleNav(actor.permissions)[0]?.items[0]?.href ?? "/settings/security";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface text-muted">
        <Lock className="size-5" strokeWidth={1.75} />
      </span>
      <div className="grid gap-1">
        <h1 className="text-base font-semibold">{t("states.forbiddenTitle")}</h1>
        <p className="text-sm text-muted">{t("states.forbiddenBody")}</p>
      </div>
      <Button asChild variant="secondary">
        <Link href={home}>{t("common.goBack")}</Link>
      </Button>
    </div>
  );
}
