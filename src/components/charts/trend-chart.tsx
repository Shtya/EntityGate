"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";

export interface TrendPoint {
  period: string;
  revenue: number;
  cost: number;
}

const HEIGHT = 240;
const PAD = { top: 16, end: 16, bottom: 28, start: 52 };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Rounded ticks from zero to just above the largest value. */
function ticks(max: number) {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const out = [];
  for (let v = 0; v < max + step; v += step) out.push(v);
  return out;
}

/**
 * Revenue against direct cost by month, on one money axis. Time reads left to right in both
 * languages. Hover, touch or arrow keys move the crosshair, and the page offers a table view.
 */
export function TrendChart({ points, locale, labels }: { points: TrendPoint[]; locale: string; labels: { revenue: string; cost: string; contribution: string; summary: string } }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const month = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en", { month: "short", timeZone: "UTC" });
  const monthLabel = (p: string) => month.format(new Date(`${p}-01T00:00:00Z`));
  const axis = ticks(Math.max(...points.flatMap((p) => [p.revenue, p.cost])));
  const top = axis[axis.length - 1];
  const innerW = width - PAD.start - PAD.end;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.start + (points.length < 2 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (Math.max(v, 0) / top) * innerH;
  const path = (key: "revenue" | "cost") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const every = width < 480 ? 3 : width < 720 ? 2 : 1;
  const last = points.length - 1;

  function moveTo(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (clientX - rect.left - PAD.start) / innerW;
    setActive(Math.min(last, Math.max(0, Math.round(ratio * last))));
  }
  const point = active === null ? null : points[active];
  const tipStart = active === null ? 0 : Math.min(Math.max(x(active) - 96, 0), width - 192);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" />{labels.revenue}</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-[var(--chart-3)]" />{labels.cost}</li>
      </ul>
      <div
        ref={box}
        dir="ltr"
        className="relative touch-pan-y rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        role="img"
        aria-label={labels.summary}
        tabIndex={0}
        onPointerMove={(e) => moveTo(e.clientX)}
        onPointerDown={(e) => moveTo(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? last) - 1));
          if (e.key === "ArrowRight") setActive((a) => Math.min(last, (a ?? -1) + 1));
          if (e.key === "Escape") setActive(null);
        }}
      >
        <svg width={width} height={HEIGHT} className="block" aria-hidden>
          {axis.map((v) => (
            <g key={v}>
              <line x1={PAD.start} x2={width - PAD.end} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={PAD.start - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted, currentColor)" className="fill-muted num">{compact.format(v)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % every === (last % every) ? <text key={p.period} x={x(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} className="fill-muted">{monthLabel(p.period)}</text> : null))}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" />}
          <path d={path("cost")} fill="none" stroke="var(--chart-3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("revenue")} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {(["cost", "revenue"] as const).map((key) => {
            const i = active ?? last;
            return <circle key={key} cx={x(i)} cy={y(points[i][key])} r={4} fill={key === "revenue" ? "var(--chart-1)" : "var(--chart-3)"} stroke="var(--surface)" strokeWidth={2} />;
          })}
        </svg>
        {point && (
          <div className="glass pointer-events-none absolute top-1 z-10 w-48 rounded-md p-2.5 text-xs" style={{ left: tipStart }} dir={locale === "ar" ? "rtl" : "ltr"}>
            <p className="mb-1 font-medium num"><bdi>{point.period}</bdi></p>
            <p className="flex justify-between gap-2"><span className="text-muted">{labels.revenue}</span><span className="num">{formatMoney(String(point.revenue), { locale, compact: true })}</span></p>
            <p className="flex justify-between gap-2"><span className="text-muted">{labels.cost}</span><span className="num">{formatMoney(String(point.cost), { locale, compact: true })}</span></p>
            <p className="mt-1 flex justify-between gap-2 border-t border-border pt-1 font-medium"><span>{labels.contribution}</span><span className="num">{formatMoney(String(point.revenue - point.cost), { locale, compact: true })}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
