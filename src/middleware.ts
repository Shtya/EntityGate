import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC = [/^\/login(\/|$)/, /^\/api\/auth\//, /^\/api\/health$/, /^\/api\/cron\//];

/** Per-request nonce: only scripts we rendered can run, which blunts any injected markup (XSS). */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes: component sizes, QR code
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Cheap edge gate: no session cookie → /login (pages) or 401 (API).
 * The real session + permission checks happen server-side in layouts and apiRoute().
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC.some((r) => r.test(pathname));

  if (!isPublic && !getSessionCookie(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required" } }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/api/")) return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp); // Next reads this to tag its own scripts
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
