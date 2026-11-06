"use client";

import { DropdownMenu as M, Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuGroup = M.Group;

export function MenuContent({ className, align = "end", ...p }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn(
          "glass z-50 min-w-48 rounded-lg p-1",
          "data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          className,
        )}
        {...p}
      />
    </M.Portal>
  );
}

export function MenuItem({ className, destructive, ...p }: React.ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:stroke-[1.75] [&_svg]:text-muted",
        destructive && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...p}
    />
  );
}

export function MenuLabel({ className, ...p }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("eyebrow px-2 pb-1 pt-1.5", className)} {...p} />;
}

export function MenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-border-card" />;
}

/** Tooltip: solid on purpose. It's tiny text, and glass would only cost legibility. */
export function Tip({ label, side = "top", children }: { label: React.ReactNode; side?: "top" | "right" | "bottom" | "left"; children: React.ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-fg px-2 py-1 text-xs text-frame data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
