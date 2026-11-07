/** True when running on Vercel: no long-lived process, no writable disk, many short-lived instances. */
export const isServerless = () => Boolean(process.env.VERCEL);

const withHttps = (host?: string) => (host ? `https://${host}` : undefined);

/**
 * The public address, for sign-in checks and links in emails. On Vercel a leftover localhost value
 * must not win over the real domain, or every sign-in fails its origin check.
 */
export function appUrl(): string | undefined {
  const configured = process.env.BETTER_AUTH_URL;
  const production = withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (configured && !(production && /localhost|127\.0\.0\.1/.test(configured))) return configured;
  return production ?? withHttps(process.env.VERCEL_URL) ?? configured;
}

/** Every address this deployment answers on, including Vercel's preview URLs. */
export function trustedOrigins(): string[] {
  const hosts = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL];
  return [appUrl(), ...hosts.map(withHttps)].filter((o): o is string => Boolean(o));
}
