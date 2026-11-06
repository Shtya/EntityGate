"use client";

import { Check, Languages, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { directionOf, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, Tip } from "@/components/ui/menu";

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

/** Stores the language and re-renders on the server; <html lang dir> update with it. */
export function useSwitchLanguage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const switchTo = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = directionOf(next);
    start(() => router.refresh());
  };
  return { switchTo, pending };
}

const iconButton = "grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg";

export function LanguageSwitch({ className }: { className?: string }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const { switchTo } = useSwitchLanguage();
  return (
    <Menu>
      <Tip label={t("language")} side="bottom">
        <MenuTrigger className={cn(iconButton, className)} aria-label={t("language")}>
          <Languages className="size-[18px]" strokeWidth={1.75} />
        </MenuTrigger>
      </Tip>
      <MenuContent className="w-44">
        <MenuLabel>{t("language")}</MenuLabel>
        {LANGUAGES.map((l) => (
          <MenuItem key={l.value} lang={l.value} onSelect={() => switchTo(l.value)}>
            <span className="flex-1">{l.label}</span>
            {l.value === locale && <Check className="!text-primary" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("shell");
  const { theme, setTheme } = useTheme();
  const label = t(theme === "dark" ? "toLight" : "toDark");
  return (
    <Tip label={label} side="bottom">
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={cn(iconButton, className)} aria-label={label}>
        {theme === "dark" ? <Sun className="size-[18px]" strokeWidth={1.75} /> : <Moon className="size-[18px]" strokeWidth={1.75} />}
      </button>
    </Tip>
  );
}
