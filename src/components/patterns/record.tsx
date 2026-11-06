import Link from "next/link";
import { cn } from "@/lib/utils";
import { TableFrame } from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";

/** Link tabs: the active tab is in the URL, so each tab renders on the server and can be shared. */
export function PageTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1" aria-label="Tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
            tab.key === active ? "bg-surface font-medium text-fg shadow-[0_0_0_1px_var(--border-card)]" : "text-muted hover:bg-surface/60 hover:text-fg",
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="text-xs text-faint num">{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "start" | "end" | "center";
  hideOnMobile?: boolean;
  nowrap?: boolean;
}

const alignCls = (a?: string) => (a === "end" ? "text-end" : a === "center" ? "text-center" : "text-start");

/** Plain server-rendered table inside the shell's table frame. Rows link from their first cell. */
export function RecordTable<T>({
  columns,
  rows,
  rowKey,
  footer,
  emptyTitle,
  emptyBody,
  emptyAction,
  minWidth = 640,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  footer?: React.ReactNode;
  emptyTitle: string;
  emptyBody?: string;
  emptyAction?: React.ReactNode;
  minWidth?: number;
}) {
  if (rows.length === 0) return <EmptyState compact title={emptyTitle} description={emptyBody} action={emptyAction} />;
  return (
    <TableFrame footer={footer}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border">
            {columns.map((c, i) => (
              <th key={i} className={cn("eyebrow h-9 whitespace-nowrap bg-surface-2/60 px-4 first:ps-5 last:pe-5", alignCls(c.align), c.hideOnMobile && "hidden md:table-cell")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border transition-colors last:border-0 hover:bg-surface-2/60">
              {columns.map((c, i) => (
                <td key={i} className={cn("px-4 py-2.5 align-middle first:ps-5 last:pe-5", alignCls(c.align), c.nowrap && "whitespace-nowrap", c.hideOnMobile && "hidden md:table-cell")}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

/** Label/value list for a record's details. */
export function DetailList({ items, columns = 2 }: { items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 px-5 py-4 text-sm", columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "")}>
      {items.map((item) => (
        <div key={item.label} className="grid min-w-0 gap-0.5">
          <dt className="text-xs text-faint">{item.label}</dt>
          <dd className="min-w-0 break-words num">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Primary cell text that links to a record. */
export function RecordLink({ href, children, sub }: { href: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Link href={href} className="font-medium text-fg underline-offset-2 hover:text-primary hover:underline">
        {children}
      </Link>
      {sub && <p className="truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Monospaced IDs (INV-00182) stay LTR inside Arabic text. */
export function Code({ children }: { children: React.ReactNode }) {
  return <bdi className="font-mono text-xs">{children}</bdi>;
}
