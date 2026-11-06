import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";

/** Internal app with no public URLs to index, so the language lives in a cookie, not the path. */
export default getRequestConfig(async () => {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: process.env.APP_TIMEZONE || "Asia/Riyadh",
  };
});
