"use client";

import { useTranslations } from "next-intl";
import { Label as RadixLabel } from "radix-ui";
import { cn } from "@/lib/utils";

export function Label({ className, ...p }: React.ComponentProps<typeof RadixLabel.Root>) {
  return <RadixLabel.Root className={cn("text-xs font-medium text-fg", className)} {...p} />;
}

/** Label + control + hint/error, with consistent rhythm. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional && <span className="text-2xs text-faint">{t("optional")}</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
