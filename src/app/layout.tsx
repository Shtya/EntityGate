import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Readex_Pro } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";
import { Providers } from "@/components/providers";
import { directionOf } from "@/i18n/config";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif", display: "swap" });
const arabic = Readex_Pro({ subsets: ["arabic"], variable: "--font-readex", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EntityGate", template: "%s · EntityGate" },
  description: "Operations hub for entity, sponsorship and workforce services.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d23" },
  ],
};

/** Applies the saved theme before paint to avoid a flash. Light is the default. */
const themeScript = `(function(){try{if(localStorage.getItem('eg-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, timeZone, requestHeaders] = await Promise.all([getLocale(), getMessages(), getTimeZone(), headers()]);
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      data-depth="b" /* Depth preset: a = very soft, b = medium (recommended), c = bold */
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${serif.variable} ${arabic.variable}`}
    >
      <head>
        {/* Browsers hide nonce values from JS by design, so React would report a false mismatch. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <Providers direction={directionOf(locale)}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
