"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, Select as S } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

/** Above this many options a search box pays for itself. */
const SEARCH_THRESHOLD = 7;

const triggerCls = cn(
  "inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-sm text-fg transition-colors",
  "hover:bg-surface-2 focus:outline-none focus-visible:ring-3 focus-visible:ring-primary/15 data-[placeholder]:text-faint",
);
const floatingCls = "glass z-50 rounded-lg data-[state=open]:animate-pop-in";
const hoverRow = "data-[highlighted]:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] data-[selected=true]:bg-[color-mix(in_oklab,var(--text)_8%,transparent)]";

/**
 * The only select in the system (native selects are banned by lint).
 * Short lists use Radix Select; long ones become a searchable combobox automatically.
 * Both get full keyboard navigation and follow the page direction.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel,
  className,
  id,
  searchable,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  /** Adds a first option that clears the value. */
  allLabel?: string;
  className?: string;
  id?: string;
  searchable?: boolean;
  "aria-label"?: string;
}) {
  const t = useTranslations("select");
  const useSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  if (useSearch) {
    return (
      <Combobox
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder={placeholder ?? t("placeholder")}
        allLabel={allLabel}
        className={className}
        id={id}
        ariaLabel={ariaLabel}
      />
    );
  }

  const ALL = "__all__";
  return (
    <S.Root value={value || (allLabel ? ALL : undefined)} onValueChange={(v) => onValueChange(v === ALL ? "" : v)}>
      <S.Trigger id={id} aria-label={ariaLabel} className={cn(triggerCls, className)}>
        {/* Children render the label on the server; otherwise it's blank until the list mounts. */}
        <S.Value placeholder={placeholder ?? t("placeholder")}>{options.find((o) => o.value === value)?.label ?? (!value ? allLabel : undefined)}</S.Value>
        <S.Icon>
          <ChevronDown className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} className={cn(floatingCls, "max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1")}>
          <S.Viewport>
            {allLabel && <Item value={ALL} label={allLabel} />}
            {options.map((o) => (
              <Item key={o.value} value={o.value} label={o.label} />
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

function Item({ value, label }: Option) {
  return (
    <S.Item value={value} className={cn("relative flex cursor-default select-none items-center rounded-md py-1.5 pe-2 ps-7 text-sm outline-none", hoverRow)}>
      <S.ItemIndicator className="absolute start-2">
        <Check className="size-3.5 text-primary" strokeWidth={2.25} />
      </S.ItemIndicator>
      <S.ItemText>{label}</S.ItemText>
    </S.Item>
  );
}

function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel,
  className,
  id,
  ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  allLabel?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("select");
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const choose = (v: string) => {
    onValueChange(v);
    setOpen(false);
  };
  const row = (key: string, label: string, isSelected: boolean, onSelect: () => void) => (
    <Command.Item key={key} value={`${label} ${key}`} onSelect={onSelect} className={cn("relative flex cursor-default select-none items-center rounded-md py-1.5 pe-2 ps-7 text-sm outline-none", hoverRow)}>
      {isSelected && <Check className="absolute start-2 size-3.5 text-primary" strokeWidth={2.25} />}
      <span className="truncate">{label}</span>
    </Command.Item>
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger id={id} role="combobox" aria-expanded={open} aria-label={ariaLabel} className={cn(triggerCls, className)}>
        <span className={cn("truncate", !selected && !allLabel && "text-faint")}>{selected?.label ?? allLabel ?? placeholder}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className={cn(floatingCls, "w-[max(var(--radix-popover-trigger-width),240px)] overflow-hidden")}>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-border-card px-2.5">
              <Search className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
              <Command.Input autoFocus placeholder={t("search")} className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-faint" />
            </div>
            <Command.List className="scroll-thin max-h-64 overflow-y-auto p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted">{t("empty")}</Command.Empty>
              {allLabel && row("__all__", allLabel, !value, () => choose(""))}
              {options.map((o) => row(o.value, o.label, o.value === value, () => choose(o.value)))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
