"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "start" | "end" | "center";
    width?: string;
    /** Hide below the md breakpoint to keep tables readable on phones. */
    hideOnMobile?: boolean;
  }
}

const alignCls = (a?: "start" | "end" | "center") => (a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start");

/**
 * Any wide table inside a card. Its own scrollbar is hidden; a thin proxy bar lives in the dock
 * above the footer, so sideways scrolling stays in reach however long the table is.
 * The dock sticks to the bottom of the well and only casts a shadow while content runs beneath it.
 */
export function TableFrame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setContentWidth(el.scrollWidth);
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { root: sentinel.closest(".well-scroll") });
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const sync = (from: HTMLElement | null, to: HTMLElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <>
      <div ref={scrollRef} className="table-scroll" onScroll={() => sync(scrollRef.current, barRef.current)}>
        {children}
      </div>
      {(footer || overflowing) && (
        <div className="table-dock" data-stuck={stuck}>
          {overflowing && (
            <div ref={barRef} className="table-hbar" onScroll={() => sync(barRef.current, scrollRef.current)}>
              <div style={{ inlineSize: contentWidth }} />
            </div>
          )}
          {footer && <div className="border-t border-border">{footer}</div>}
        </div>
      )}
      <div ref={sentinelRef} className="h-px" aria-hidden />
    </>
  );
}

export function DataTable<T>({
  columns,
  data,
  loading,
  empty,
  onRowClick,
  rowKey,
  density = "comfortable",
  initialSorting = [],
  pageSize = 25,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  density?: "comfortable" | "compact";
  initialSorting?: SortingState;
  pageSize?: number;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    initialState: { pagination: { pageSize, pageIndex: 0 } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (r) => rowKey(r),
  });

  const cellPad = density === "compact" ? "py-1.5" : "py-2.5";
  const { pageIndex, pageSize: size } = table.getState().pagination;

  return (
    <>
      <TableFrame
        footer={
          !loading && data.length > 0 ? (
            <TablePager
              total={data.length}
              pageIndex={pageIndex}
              pageSize={size}
              canPrevious={table.getCanPreviousPage()}
              canNext={table.getCanNextPage()}
              onPrevious={table.previousPage}
              onNext={table.nextPage}
              onPageSize={table.setPageSize}
            />
          ) : undefined
        }
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta;
                  const sortable = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      style={{ inlineSize: meta?.width }}
                      className={cn("eyebrow h-9 whitespace-nowrap bg-surface-2/60 px-4 first:ps-5 last:pe-5", alignCls(meta?.align), meta?.hideOnMobile && "hidden md:table-cell")}
                      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    >
                      {h.isPlaceholder ? null : sortable ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("eyebrow inline-flex items-center gap-1 hover:text-fg", meta?.align === "end" && "flex-row-reverse")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {columns.map((c, j) => (
                      <td key={j} className={cn("px-4 first:ps-5 last:pe-5", cellPad, c.meta?.hideOnMobile && "hidden md:table-cell")}>
                        <Skeleton className={cn("h-3.5", j === 0 ? "w-40" : "w-20", c.meta?.align === "end" && "ms-auto")} />
                      </td>
                    ))}
                  </tr>
                ))
              : table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn("border-b border-border transition-colors last:border-0", onRowClick && "cursor-pointer hover:bg-surface-2/70")}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td key={cell.id} className={cn("px-4 align-middle first:ps-5 last:pe-5", cellPad, alignCls(meta?.align), meta?.hideOnMobile && "hidden md:table-cell")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </TableFrame>
      {!loading && data.length === 0 && empty}
    </>
  );
}

const PAGE_SIZES = [10, 25, 50, 100];

export function TablePager({
  total,
  pageIndex,
  pageSize,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onPageSize,
}: {
  total: number;
  pageIndex: number;
  pageSize: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onPageSize: (size: number) => void;
}) {
  const t = useTranslations("table");
  const f = useFormat();
  const start = pageIndex * pageSize + 1;
  const end = Math.min(total, (pageIndex + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="hidden sm:inline">{t("rowsPerPage")}</span>
        <Select
          aria-label={t("rowsPerPage")}
          value={String(pageSize)}
          onValueChange={(v) => onPageSize(Number(v))}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: f.number(n) }))}
          className="w-[72px]"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted num">{t("range", { start: f.number(start), end: f.number(end), total: f.number(total) })}</span>
        <Button variant="ghost" size="icon-sm" disabled={!canPrevious} onClick={onPrevious} aria-label={t("previous")}>
          <ChevronLeft className="rtl:-scale-x-100" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={!canNext} onClick={onNext} aria-label={t("next")}>
          <ChevronRight className="rtl:-scale-x-100" />
        </Button>
      </div>
    </div>
  );
}
