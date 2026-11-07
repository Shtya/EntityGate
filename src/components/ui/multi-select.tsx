"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Option } from "./select";

/** Searchable pick-several list. Chosen items show as removable chips under the field. */
export function MultiSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  "aria-label": ariaLabel,
}: {
  value: string[];
  onValueChange: (v: string[]) => void;
  options: Option[];
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("select");
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onValueChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="grid gap-1.5">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="inline-flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-sm transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-3 focus-visible:ring-primary/15"
        >
          <span className={cn("truncate", !chosen.length && "text-faint")}>{chosen.length ? t("chosen", { count: chosen.length }) : (placeholder ?? t("placeholder"))}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={4} className="glass z-50 w-[max(var(--radix-popover-trigger-width),260px)] overflow-hidden rounded-lg data-[state=open]:animate-pop-in">
            <Command loop>
              <div className="flex items-center gap-2 border-b border-border-card px-2.5">
                <Search className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                <Command.Input autoFocus placeholder={t("search")} className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-faint" />
              </div>
              <Command.List className="scroll-thin max-h-64 overflow-y-auto p-1">
                <Command.Empty className="py-6 text-center text-sm text-muted">{t("empty")}</Command.Empty>
                {options.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={`${o.label} ${o.value}`}
                    onSelect={() => toggle(o.value)}
                    className="relative flex cursor-default select-none items-center rounded-md py-1.5 pe-2 ps-7 text-sm outline-none data-[selected=true]:bg-[color-mix(in_oklab,var(--text)_8%,transparent)]"
                  >
                    {value.includes(o.value) && <Check className="absolute start-2 size-3.5 text-primary" strokeWidth={2.25} />}
                    <span className="truncate">{o.label}</span>
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {chosen.map((o) => (
            <li key={o.value} className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 py-0.5 pe-1 ps-2.5 text-xs">
              <span className="truncate">{o.label}</span>
              <button type="button" onClick={() => toggle(o.value)} aria-label={t("remove", { label: o.label })} className="grid size-4 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
