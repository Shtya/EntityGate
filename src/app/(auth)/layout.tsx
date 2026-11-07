import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActorOrNull } from "@/server/rbac/actor";
import { LanguageSwitch, ThemeToggle } from "@/components/shell/preferences";
import { Wordmark } from "@/components/shell/brand";

/**
 * Sign-in: one deep brand field with the gate drawn large, and a glass card over it.
 * This is the one full-screen place glass is allowed, because there's real depth behind it.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getActorOrNull()) redirect("/");
  const t = await getTranslations("login");

  return (
    <div className="auth-field relative isolate grid min-h-dvh grid-rows-[auto_1fr_auto] overflow-clip text-white">
      <Arches />
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Wordmark />
        <div className="flex items-center gap-1 [&_button]:text-white/70 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-20">
        <div className="hidden animate-rise lg:block">
          <p className="font-display text-[52px] leading-[1.04] tracking-[-0.01em]">
            {t("headlineStart")} <em className="text-[#4fcad3]">{t("headlineEnd")}</em>
          </p>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">{t("blurb")}</p>
        </div>
        <div className="glass auth-card mx-auto w-full max-w-[420px] animate-rise rounded-lg p-7 text-fg [animation-delay:60ms] sm:p-9">{children}</div>
      </main>

      <footer className="px-6 py-5 text-center text-xs text-white/50 sm:px-10 lg:text-start">{t("monitored")}</footer>
    </div>
  );
}

/** Concentric arches: the gate from the logo. Physical position is mirrored through --dir. */
function Arches() {
  return (
    <svg className="auth-arches pointer-events-none absolute -bottom-32 -z-10 h-[820px] w-[820px]" viewBox="0 0 720 720" fill="none" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => {
        const w = 120 + i * 64;
        const x = 360 - w / 2;
        return (
          <path
            key={i}
            d={`M${x} 720V${360 - i * 6}a${w / 2} ${w / 2} 0 0 1 ${w} 0V720`}
            stroke={i === 3 ? "#3cc0cc" : "rgba(255,255,255,0.1)"}
            strokeWidth={i === 3 ? 1.5 : 1}
          />
        );
      })}
    </svg>
  );
}
