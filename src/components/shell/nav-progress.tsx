"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar that starts the moment an internal link is clicked and completes when the new page
 * arrives, so a slow server response never feels like a dead click.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef(0);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/print/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      window.clearTimeout(timer.current);
      setState("loading");
    };
    // Capture phase: Next.js Link cancels the click before it would bubble up to here.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The address changes as soon as the loading skeleton shows; finish only once real content replaces it.
  useEffect(() => {
    const finish = () => {
      setState((s) => (s === "loading" ? "done" : s));
      timer.current = window.setTimeout(() => setState("idle"), 450);
    };
    if (!document.querySelector(".loading-delayed")) {
      finish();
      return () => window.clearTimeout(timer.current);
    }
    const watch = new MutationObserver(() => {
      if (document.querySelector(".loading-delayed")) return;
      watch.disconnect();
      finish();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div className="nav-progress" aria-hidden>
      <span style={{ transform: `scaleX(${state === "done" ? 1 : 0.8})`, opacity: state === "done" ? 0 : 1, transitionDuration: state === "done" ? "200ms, 200ms" : undefined }} ref={(el) => {
        // Start from zero, then let the transition carry it to 80%.
        if (el && state === "loading" && !el.dataset.started) {
          el.dataset.started = "1";
          el.style.transform = "scaleX(0)";
          void el.offsetWidth;
          el.style.transform = "scaleX(0.8)";
        }
      }} />
    </div>
  );
}
