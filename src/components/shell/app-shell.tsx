"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "./command-palette";
import { Header } from "./header";
import { MainWell } from "./main-well";
import { NavProgress } from "./nav-progress";
import { visibleNav } from "./nav";
import { Sidebar } from "./sidebar";

export interface ShellUser {
  name: string;
  email: string;
  title: string | null;
  roles: string[];
}

const SHELL_ANIMATION_MS = 320;

/**
 * The frame every page lives in: sidebar and header form one raised L, the page sits in the well.
 * Pages never touch this; the (app) layout wraps them automatically.
 */
export function AppShell({
  user,
  permissions,
  initialCollapsed,
  children,
}: {
  user: ShellUser;
  permissions: string[];
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const nav = useMemo(() => visibleNav(permissions), [permissions]);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => setDrawerOpen(false), [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      // A cookie, not localStorage: the server renders the right width on first paint.
      document.cookie = `eg-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      // Layout snaps to the end state; a transform-only slide (FLIP) covers the difference.
      const shell = shellRef.current;
      if (shell) {
        shell.dataset.animating = next ? "collapse" : "expand";
        window.setTimeout(() => delete shell.dataset.animating, SHELL_ANIMATION_MS);
      }
      return next;
    });
  }, []);

  // ⌘K / Ctrl+K palette, "G then <key>" navigation, Esc closes the drawer.
  const gPressedAt = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (e.key === "Escape") setDrawerOpen(false);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g") {
        gPressedAt.current = Date.now();
        return;
      }
      if (Date.now() - gPressedAt.current < 900) {
        const item = nav.flatMap((s) => s.items).find((i) => i.key === e.key.toLowerCase());
        if (item) router.push(item.href);
        gPressedAt.current = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, router]);

  return (
    <div ref={shellRef} className="shell" data-sidebar={collapsed ? "collapsed" : "expanded"} data-drawer={drawerOpen ? "open" : "closed"}>
      <Sidebar nav={nav} collapsed={collapsed} drawerOpen={drawerOpen} pathname={pathname} onToggle={toggleCollapsed} onCloseDrawer={() => setDrawerOpen(false)} />
      {drawerOpen && <div className="fixed inset-0 z-20 animate-fade-in bg-overlay lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />}
      <Header user={user} inert={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
      <MainWell inert={drawerOpen} pathname={pathname}>
        {children}
      </MainWell>
      <Suspense>
        <NavProgress />
      </Suspense>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} nav={nav} />
    </div>
  );
}
