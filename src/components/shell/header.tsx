"use client";

import { LogOut, Menu as MenuIcon, Search, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar, Kbd } from "@/components/ui/misc";
import type { ShellUser } from "./app-shell";
import { BrandMark } from "./brand";
import { NotificationBell } from "./notification-bell";
import { LanguageSwitch, ThemeToggle } from "./preferences";

export function Header({
  user,
  inert,
  onOpenDrawer,
  onOpenPalette,
}: {
  user: ShellUser;
  inert?: boolean;
  onOpenDrawer: () => void;
  onOpenPalette: () => void;
}) {
  const t = useTranslations();
  return (
    <header className="shell-head" inert={inert}>
      <div className="head-start flex min-w-0 flex-1 items-center gap-2">
        <button
          onClick={onOpenDrawer}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg lg:hidden"
          aria-label={t("shell.openNav")}
        >
          <MenuIcon className="size-[18px]" strokeWidth={1.75} />
        </button>
        <span className="md:hidden">
          <BrandMark size={24} />
        </span>
        <button
          onClick={onOpenPalette}
          aria-label={t("shell.search")}
          className="ms-auto flex size-9 min-w-0 items-center justify-center gap-2 rounded-md text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg sm:ms-0 sm:h-9 sm:w-full sm:max-w-80 sm:justify-start sm:border sm:border-border sm:bg-surface sm:px-3 sm:hover:border-border-strong sm:hover:bg-surface"
        >
          <Search className="size-4 shrink-0" strokeWidth={1.75} />
          <span className="hidden truncate sm:inline">{t("shell.search")}</span>
          <span className="ms-auto hidden items-center gap-0.5 sm:flex" dir="ltr">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <NotificationBell />
        <LanguageSwitch />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const t = useTranslations();
  const router = useRouter();
  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };
  const role = user.roles[0];

  return (
    <Menu>
      <MenuTrigger className="ms-1 flex h-9 items-center gap-2 rounded-md px-1 transition-colors hover:bg-surface-2 sm:pe-2" aria-label={t("shell.account")}>
        <Avatar name={user.name} size={28} />
        <span className="hidden max-w-40 text-start leading-tight xl:block">
          <span className="block truncate text-xs font-medium">{user.name}</span>
          <span className="block truncate text-2xs text-faint">{role ? t(`roles.${role}`) : t("shell.noRole")}</span>
        </span>
      </MenuTrigger>
      <MenuContent className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted">
            <bdi>{user.email}</bdi>
          </p>
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push("/settings/security")}>
          <Shield /> {t("shell.security")}
        </MenuItem>
        <MenuItem onSelect={signOut}>
          <LogOut /> {t("shell.signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
