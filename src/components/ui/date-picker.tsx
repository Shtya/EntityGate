"use client";

import { CalendarDays, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { arSA, enGB } from "react-day-picker/locale";
import { directionOf } from "@/i18n/config";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
/** Calendar values stay "YYYY-MM-DD" strings, so no timezone can shift the chosen day. */
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromValue = (v: string) => {
  const [y, m, day] = v.split("-").map(Number);
  return new Date(y, m - 1, day);
};

/** The only date input in the system (native date inputs are banned by lint). */
export function DatePicker({
  value,
  onValueChange,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("date");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = value ? fromValue(value) : undefined;
  // Show the day as written (noon UTC keeps it stable when formatted in Asia/Riyadh).
  const display = value ? formatDate(new Date(`${value}T12:00:00Z`), locale) : null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn("relative inline-flex", className)}>
        <Popover.Trigger
          aria-label={ariaLabel}
          className="inline-flex h-8 w-full items-center gap-2 rounded-md border border-border-strong bg-surface pe-7 ps-2.5 text-sm text-fg transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-3 focus-visible:ring-primary/15"
        >
          <CalendarDays className="size-3.5 shrink-0 text-muted" strokeWidth={1.75} />
          <span className={cn("truncate num", !display && "text-faint")}>{display ?? placeholder ?? t("placeholder")}</span>
        </Popover.Trigger>
        {value && (
          <button
            type="button"
            onClick={() => onValueChange("")}
            aria-label={t("clear")}
            className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-faint hover:text-fg"
          >
            <X className="size-3" strokeWidth={2} />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="glass z-50 rounded-lg p-3 data-[state=open]:animate-pop-in">
          <DayPicker
            mode="single"
            autoFocus
            dir={directionOf(locale)}
            locale={locale === "ar" ? arSA : enGB}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              onValueChange(d ? toValue(d) : "");
              setOpen(false);
            }}
            classNames={{
              root: "text-sm",
              months: "relative",
              month: "grid gap-2",
              month_caption: "flex h-8 items-center justify-center font-medium",
              nav: "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between",
              button_previous: "grid size-8 place-items-center rounded-md text-muted hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] hover:text-fg",
              button_next: "grid size-8 place-items-center rounded-md text-muted hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] hover:text-fg",
              chevron: "size-4 fill-current",
              weekday: "size-9 text-center text-xs font-medium text-faint",
              day: "size-9 p-0 text-center num",
              day_button: "size-9 rounded-md transition-colors hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)] focus-visible:outline-2 focus-visible:outline-ring",
              today: "font-semibold text-primary",
              selected: "[&>button]:bg-primary [&>button]:text-on-primary [&>button]:hover:bg-primary-hover",
              outside: "text-faint opacity-50",
              disabled: "opacity-40",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
