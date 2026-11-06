import Link from "next/link";

export interface BarItem {
  label: string;
  value: number;
  href?: string;
}

/** Ranked horizontal bars in one hue, with the value at the end. Long lists fold into "other". */
export function BarList({ items, limit = 6, otherLabel, emptyLabel }: { items: BarItem[]; limit?: number; otherLabel: string; emptyLabel: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit).reduce((a, i) => a + i.value, 0);
  const rows = rest > 0 ? [...shown, { label: otherLabel, value: rest }] : shown;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => {
        const row = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="shrink-0 font-medium num">{r.value}</span>
            </span>
            <span className="mt-1 block h-1.5 rounded-e-[4px] bg-[var(--chart-1)]" style={{ inlineSize: `${Math.max((r.value / max) * 100, 1.5)}%` }} />
          </>
        );
        return (
          <li key={r.label} title={`${r.label}: ${r.value}`}>
            {"href" in r && r.href ? <Link href={r.href} className="block rounded-sm hover:text-primary">{row}</Link> : row}
          </li>
        );
      })}
    </ul>
  );
}
