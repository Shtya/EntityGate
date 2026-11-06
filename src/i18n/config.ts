export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "eg-locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export function directionOf(locale: string): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * BCP-47 tag for Intl. Plain "ar-SA" defaults to the Umm al-Qura calendar, which would render
 * invoice dates in Hijri, so the Gregorian calendar and Latin digits are set explicitly.
 */
export function intlLocale(locale: string): string {
  return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
}
