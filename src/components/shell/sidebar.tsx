"use client";

import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Tooltip as T } from "radix-ui";
import { useRef, useState } from "react";
import { directionOf } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { BrandMark, Wordmark } from "./brand";
import type { NavItem, NavSection } from "./nav";

export function Sidebar({
  nav,
  collapsed,
  drawerOpen,
  pathname,
  onToggle,
  onCloseDrawer,
}: {
  nav: NavSection[];
  collapsed: boolean;
  drawerOpen: boolean;
  pathname: string;
  onToggle: () => void;
  onCloseDrawer: () => void;
}) {
  const t = useTranslations();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className="shell-side">
      <div className="shell-side-inner">
        <div className="flex h-[var(--header-h)] shrink-0 items-center ps-[22px]">
          <Link href="/" prefetch={false} aria-label={t("shell.home")} className="flex items-center gap-2.5 rounded-md">
            <BrandMark size={28} />
            <span className="nav-label">
              <Wordmark textOnly />
            </span>
          </Link>
          {drawerOpen && (
            <button
              onClick={onCloseDrawer}
              className="ms-auto me-3 grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t("shell.closeNav")}
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>

        <nav className="side-scroll min-h-0 flex-1 overflow-y-auto overflow-x-clip scroll-thin">
          <div className="px-4 pb-4 pt-2">
          {nav.map((section) => (
            <div key={section.labelKey} className="mb-5">
              <p className="nav-label eyebrow mb-1.5 truncate px-3">{t(section.labelKey)}</p>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href} className="min-w-0">
                    <SideLink item={item} active={isActive(item.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>
        </nav>

        <div className="hidden shrink-0 px-4 pb-4 lg:block">
          <button
            onClick={onToggle}
            aria-label={t(collapsed ? "shell.expand" : "shell.collapse")}
            aria-expanded={!collapsed}
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Toggle className="size-4 shrink-0 rtl:-scale-x-100" strokeWidth={1.75} />
            <span className="nav-label truncate">{t("shell.collapseShort")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Tooltip appears only when the label can't be read: on the rail, or when it's truncated. */
function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const labelRef = useRef<HTMLSpanElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const label = t(item.labelKey);

  return (
    <T.Root
      open={tipOpen}
      onOpenChange={(open) => {
        const el = labelRef.current;
        const unreadable = !!el && (getComputedStyle(el).visibility === "hidden" || el.scrollWidth > el.clientWidth);
        setTipOpen(open && unreadable);
      }}
    >
      <T.Trigger asChild>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          aria-label={label}
          className={cn(
            "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
            active ? "bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--border-card),var(--card-shadow)]" : "text-muted hover:bg-surface-2 hover:text-fg",
          )}
        >
          {active && <span className="absolute -start-4 top-2 h-6 w-1 rounded-e-full bg-accent" aria-hidden />}
          <item.icon className={cn("size-4 shrink-0", active && "text-primary")} strokeWidth={1.75} />
          <span ref={labelRef} className="nav-label truncate">
            {label}
          </span>
        </Link>
      </T.Trigger>
      <T.Portal>
        <T.Content
          side={directionOf(locale) === "rtl" ? "left" : "right"}
          sideOffset={10}
          className="z-50 rounded-md bg-fg px-2 py-1 text-xs text-frame data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export { BrandMark };
