import { cva, type VariantProps } from "class-variance-authority";
import { cn, initials } from "@/lib/utils";

// ───────────── Badge / status pill ─────────────

const badge = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted",
      primary: "bg-primary-soft text-primary",
      accent: "bg-accent-soft text-accent",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-danger-soft text-danger",
      info: "bg-info-soft text-info",
    },
    size: { sm: "h-5 px-2 text-2xs", md: "h-6 px-2.5 text-xs" },
  },
  defaultVariants: { tone: "neutral", size: "sm" },
});

export function Badge({
  tone,
  size,
  dot,
  className,
  children,
}: VariantProps<typeof badge> & { dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(badge({ tone, size }), className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

// ───────────── Avatar (initials, deterministic tint) ─────────────

const TINTS = ["bg-primary-soft text-primary", "bg-accent-soft text-accent", "bg-success-soft text-success", "bg-info-soft text-info", "bg-surface-3 text-fg"];

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight", TINTS[h % TINTS.length], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// ───────────── Skeleton ─────────────

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-surface-3 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--surface),transparent_40%),transparent)] bg-[length:400px_100%] bg-no-repeat",
        className,
      )}
      aria-hidden
    />
  );
}

// ───────────── Kbd ─────────────

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-grid h-5 min-w-5 place-items-center rounded-[calc(var(--radius-control)-2px)] border border-border-strong bg-surface px-1 font-mono text-2xs text-muted", className)}>
      {children}
    </kbd>
  );
}

// ───────────── Panel: the one card, floating in the well ─────────────

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("card", className)} {...p} />;
}

export function PanelHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-3.5", className)}>
      <div className="grid gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

/**
 * One number with a label. Floats on its own: stats are never wrapped in a second card.
 * Numbers never get cut off: on a narrow tile the icon steps aside and the figure shrinks to fit.
 */
export function StatTile({ icon, label, value, className }: { icon?: React.ReactNode; label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card @container flex min-w-0 items-center gap-3.5 px-5 py-4", className)}>
      {icon && <span className="hidden size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary @[210px]:grid [&_svg]:size-[18px] [&_svg]:stroke-[1.75]">{icon}</span>}
      <div className="min-w-0">
        <div className="whitespace-nowrap text-base font-semibold leading-tight tracking-[-0.02em] num @[170px]:text-lg @[230px]:text-xl">{value}</div>
        <p className="line-clamp-2 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}
