import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="grid min-w-0 gap-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
