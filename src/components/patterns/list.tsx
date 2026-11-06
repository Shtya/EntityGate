"use client";

import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, type Option } from "@/components/ui/select";

export type FilterSpec =
  | { key: string; type: "search"; label: string }
  | { key: string; type: "select"; label: string; options: Option[]; allLabel: string }
  | { key: string; type: "date"; label: string };

/** Filters live in the URL: shareable, server-rendered, and the back button works. */
export function FilterBar({ filters, count, children }: { filters: FilterSpec[]; count?: string; children?: React.ReactNode }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const searchSpec = filters.find((f) => f.type === "search");
  const urlQ = searchSpec ? (params.get(searchSpec.key) ?? "") : "";
  const [q, setQ] = useState(urlQ);
  const first = useRef(true);

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!searchSpec || q === urlQ) return;
    const timer = setTimeout(() => push(searchSpec.key, q), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = filters.some((f) => params.get(f.key));

  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-b border-border p-3 transition-opacity", pending && "opacity-60")}>
      {filters.map((f) =>
        f.type === "search" ? (
          <div key={f.key} className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={f.label} aria-label={f.label} className="ps-8" />
          </div>
        ) : f.type === "select" ? (
          <Select key={f.key} aria-label={f.label} value={params.get(f.key) ?? ""} onValueChange={(v) => push(f.key, v)} allLabel={f.allLabel} options={f.options} className="w-full sm:w-44" />
        ) : (
          <DatePicker key={f.key} aria-label={f.label} placeholder={f.label} value={params.get(f.key) ?? ""} onValueChange={(v) => push(f.key, v)} className="w-full sm:w-40" />
        ),
      )}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            start(() => router.replace(pathname));
          }}
        >
          <X /> {t("clear")}
        </Button>
      )}
      {children}
      {count && <p className="text-xs text-muted sm:ms-auto num">{count}</p>}
    </div>
  );
}

/** Server-driven page links for long lists. */
export function ListPager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const t = useTranslations("table");
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `${pathname}?${next}`;
  };
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-end gap-2 px-5 py-2">
      <span className="text-xs text-muted num">{t("range", { start, end, total })}</span>
      <Button asChild={page > 1} variant="ghost" size="icon-sm" disabled={page <= 1} aria-label={t("previous")}>
        {page > 1 ? (
          <Link href={href(page - 1)}>
            <ChevronLeft className="rtl:-scale-x-100" />
          </Link>
        ) : (
          <ChevronLeft className="rtl:-scale-x-100" />
        )}
      </Button>
      <Button asChild={page < pages} variant="ghost" size="icon-sm" disabled={page >= pages} aria-label={t("next")}>
        {page < pages ? (
          <Link href={href(page + 1)}>
            <ChevronRight className="rtl:-scale-x-100" />
          </Link>
        ) : (
          <ChevronRight className="rtl:-scale-x-100" />
        )}
      </Button>
    </div>
  );
}
