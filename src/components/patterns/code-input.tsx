"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** 6-box one-time-code input with paste support. */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("verify");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  // Disabling an input drops its focus; give it back once a failed attempt re-enables the boxes.
  useEffect(() => {
    if (!disabled) refs.current[Math.min(value.length, length - 1)]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const set = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };

  return (
    <div dir="ltr" className="flex justify-between gap-2" role="group" aria-label={t("group")}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          aria-label={t("digit", { n: i + 1 })}
          aria-invalid={invalid || undefined}
          maxLength={length}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (v.length > 1) return set(v); // paste / autofill
            set((value.slice(0, i) + v).slice(0, length));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData("text"));
          }}
          className={cn(
            "h-12 w-full min-w-0 rounded-md border border-border-strong bg-surface text-center font-mono text-lg font-medium",
            "transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15",
            invalid && "border-danger",
          )}
        />
      ))}
    </div>
  );
}
