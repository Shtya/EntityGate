"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney, type MoneyInput } from "@/lib/money";
import { intlLocale } from "@/i18n/config";

/** Locale-aware formatters for client components. */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      date: (d: Date | string) => formatDate(d, locale),
      dateTime: (d: Date | string) => formatDateTime(d, locale),
      money: (v: MoneyInput, opts?: { compact?: boolean; accounting?: boolean; currency?: string }) => formatMoney(v, { ...opts, locale }),
      number: (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n),
    }),
    [locale],
  );
}
