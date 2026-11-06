"use client";

import { Command } from "cmdk";
import { Building2, CornerDownLeft, FolderKanban, IdCard, Languages, ListChecks, LogOut, Moon, ReceiptText, Search, Shield, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "@/components/theme";
import { Kbd } from "@/components/ui/misc";
import type { NavSection } from "./nav";
import { useSwitchLanguage } from "./preferences";

interface SearchHit {
  type: "client" | "employee" | "invoice" | "case" | "task";
  id: string;
  title: string;
  sub: string | null;
  href: string;
}
const HIT_ICON = { client: Building2, employee: IdCard, invoice: ReceiptText, case: FolderKanban, task: ListChecks } as const;

const itemCls =
  "flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-sm text-fg data-[selected=true]:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] [&_svg]:size-4 [&_svg]:text-muted [&_svg]:stroke-[1.75]";
const groupCls =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint";

export function CommandPalette({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nav: NavSection[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const { switchTo } = useSwitchLanguage();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Records come from the server, already limited to what this person may open.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api<SearchHit[]>(`/search?q=${encodeURIComponent(q)}`)
        .then((rows) => !stale && setHits(rows))
        .catch(() => !stale && setHits([]));
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const hitTypes = (["client", "employee", "invoice", "case", "task"] as const).filter((k) => hits.some((h) => h.type === k));

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="glass fixed inset-x-0 top-[14vh] z-50 mx-auto w-[calc(100vw-32px)] max-w-xl overflow-hidden rounded-lg data-[state=open]:animate-pop-in"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{t("palette.title")}</Dialog.Title>
          <Command loop label={t("palette.title")}>
            <div className="flex items-center gap-2.5 border-b border-border-card px-4">
              <Search className="size-4 text-faint" strokeWidth={1.75} />
              <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={t("palette.placeholder")} className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scroll-thin max-h-[50vh] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted">{t("palette.empty")}</Command.Empty>
              {hitTypes.map((type) => (
                <Command.Group key={type} heading={t(`palette.${type}`)} forceMount className={groupCls}>
                  {hits.filter((h) => h.type === type).map((h) => {
                    const Icon = HIT_ICON[type];
                    return (
                      <Command.Item key={h.id} forceMount value={`${type}-${h.id}`} onSelect={() => run(() => router.push(h.href))} className={itemCls}>
                        <Icon />
                        <span className="min-w-0 truncate">{h.title}</span>
                        {h.sub && <span className="ms-auto shrink-0 truncate text-xs text-faint" dir="auto">{h.sub}</span>}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
              {nav.map((section) => (
                <Command.Group key={section.labelKey} heading={t(section.labelKey)} className={groupCls}>
                  {section.items.map((item) => (
                    <Command.Item key={item.href} value={t(item.labelKey)} onSelect={() => run(() => router.push(item.href))} className={itemCls}>
                      <item.icon />
                      {t(item.labelKey)}
                      {item.key && (
                        <span className="ms-auto flex gap-0.5" dir="ltr">
                          <Kbd>G</Kbd>
                          <Kbd>{item.key.toUpperCase()}</Kbd>
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              <Command.Group heading={t("palette.preferences")} className={groupCls}>
                <Command.Item onSelect={() => run(() => router.push("/settings/security"))} className={itemCls}>
                  <Shield /> {t("shell.security")}
                </Command.Item>
                <Command.Item onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))} className={itemCls}>
                  {theme === "dark" ? <Sun /> : <Moon />} {t(theme === "dark" ? "shell.toLight" : "shell.toDark")}
                </Command.Item>
                <Command.Item onSelect={() => run(() => switchTo(locale === "ar" ? "en" : "ar"))} className={itemCls}>
                  <Languages /> {t("palette.switchLanguage")}
                </Command.Item>
                <Command.Item
                  onSelect={() =>
                    run(async () => {
                      await authClient.signOut();
                      router.replace("/login");
                      router.refresh();
                    })
                  }
                  className={itemCls}
                >
                  <LogOut /> {t("shell.signOut")}
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border-card px-4 py-2 text-xs text-faint">
              <span className="flex items-center gap-1">
                <CornerDownLeft className="size-3 rtl:-scale-x-100" /> {t("palette.select")}
              </span>
              <span>↑↓ {t("palette.navigate")}</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
