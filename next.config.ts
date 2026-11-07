import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The dev badge sat on top of the sidebar's collapse control and misled layout reviews.
  devIndicators: false,
  serverExternalPackages: ["@node-rs/argon2", "pg-boss", "exceljs", "nodemailer"],
  // ExcelJS reaches these packages through a conditional export the build's file tracing misses,
  // which crashed every page that loads it in the deployed bundle.
  outputFileTracingIncludes: { "/**/*": ["./node_modules/generator-function/**/*", "./node_modules/async-function/**/*", "./node_modules/set-cookie-parser/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
