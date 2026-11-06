import { cn } from "@/lib/utils";

/**
 * Empty state with a quiet line illustration (brass on paper) and one clear action.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  compact,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-10" : "gap-3 py-16", className)}>
      <svg width="88" height="64" viewBox="0 0 88 64" fill="none" aria-hidden className="text-accent">
        <rect x="14.5" y="10.5" width="59" height="43" rx="5.5" stroke="var(--border-strong)" />
        <path d="M14.5 21.5h59" stroke="var(--border-strong)" />
        <circle cx="21" cy="16" r="1.5" fill="var(--border-strong)" />
        <circle cx="26" cy="16" r="1.5" fill="var(--border-strong)" />
        <path d="M24 31.5h22M24 37.5h34M24 43.5h16" stroke="currentColor" strokeLinecap="round" strokeOpacity=".75" />
        <circle cx="64" cy="44" r="9.5" fill="var(--surface)" stroke="currentColor" />
        <path d="m71 51 5 5" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <div className="grid max-w-sm gap-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 py-14 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path d="M10 6v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="10" cy="14" r="1" fill="currentColor" />
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <div className="grid max-w-sm gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
