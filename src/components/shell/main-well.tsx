"use client";

import { useEffect, useRef } from "react";

/**
 * The recessed canvas. The outer element holds still and owns the rounded corner and inset
 * shadow; the inner element is the only scroller in the app, so the frame never moves.
 */
export function MainWell({ inert, pathname, children }: { inert?: boolean; pathname: string; children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // The scroller isn't the window, so Next's scroll reset can't reach it.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    const el = scrollRef.current;
    const shell = el?.closest<HTMLElement>(".shell");
    if (!el || !shell) return;
    let hideThumb = 0;
    const onScroll = () => {
      const scrolled = el.scrollTop > 2 ? "true" : "false";
      if (shell.dataset.scrolled !== scrolled) shell.dataset.scrolled = scrolled;
      shell.dataset.scrolling = "true";
      window.clearTimeout(hideThumb);
      hideThumb = window.setTimeout(() => (shell.dataset.scrolling = "false"), 800);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(hideThumb);
    };
  }, []);

  return (
    <div className="well" inert={inert}>
      <div ref={scrollRef} className="well-scroll scroll-region" tabIndex={-1}>
        {children}
      </div>
      <div className="well-edge" aria-hidden />
      <div className="well-depth" aria-hidden />
    </div>
  );
}

/** Applied by the (app) layout, so every page gets the same padding, width and entrance. */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <main className="page">{children}</main>;
}
