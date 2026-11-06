"use client";

import { Checkbox as C } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...p }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[calc(var(--radius-control)-2px)] border border-border-strong bg-surface transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        className,
      )}
      {...p}
    >
      <C.Indicator>
        <Check className="size-3" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}
