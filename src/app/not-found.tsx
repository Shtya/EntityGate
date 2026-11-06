import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="grid min-h-dvh place-items-center bg-well px-6">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <p className="font-display text-6xl text-accent">404</p>
        <h1 className="text-base font-semibold">{t("states.notFoundTitle")}</h1>
        <p className="text-sm text-muted">{t("states.notFoundBody")}</p>
        <Button asChild variant="secondary" className="mt-2">
          <Link href="/">{t("common.goBack")}</Link>
        </Button>
      </div>
    </main>
  );
}
