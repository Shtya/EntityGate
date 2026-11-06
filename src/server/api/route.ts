import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import type { ZodType } from "zod";
import { getActorOrNull, requirePermission, type Actor } from "@/server/rbac/actor";
import { needsMfaEnrollment } from "@/server/rbac/policy";
import type { PermissionKey } from "@/server/rbac/catalog";
import { AppError, toAppError, unauthenticated } from "@/server/errors";
import { rateLimit } from "./rate-limit";

type Params = Record<string, string | string[]>;

export interface RouteContext<B, Q> {
  req: NextRequest;
  actor: Actor;
  body: B;
  query: Q;
  params: Params;
  ip: string | null;
  userAgent: string | null;
}

interface RouteOptions<B, Q> {
  /** Permission required to call this endpoint (checked + audited on denial). */
  permission?: PermissionKey;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  handler: (ctx: RouteContext<B, Q>) => Promise<unknown>;
  /** Reachable before required security setup is done (only the password change itself). */
  allowDuringSetup?: boolean;
  /** Response status on success (default 200). */
  status?: number;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function errorResponse(err: AppError) {
  const t = await getTranslations();
  const translate = (key: string) => (t.has(key) ? t(key) : key);
  const details = Array.isArray(err.details)
    ? err.details.map((d: { path: string; message: string }) => ({ path: d.path, message: translate(d.message) }))
    : undefined;
  return NextResponse.json({ error: { code: err.code, message: translate(err.message), details } }, { status: err.status });
}

/** Basic CSRF defense for cookie-authenticated mutations. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (Postman CLI, server-to-server) send no Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  // canParse: a sandboxed page sends "Origin: null", which must be a 403, not a crash.
  if (!host || !URL.canParse(origin) || new URL(origin).host !== host) {
    throw new AppError("FORBIDDEN", "errors.crossOrigin");
  }
}

/**
 * Wraps every /api/v1 handler with: authentication, MFA enforcement, rate limiting,
 * permission check (audited), Zod validation and consistent error envelopes.
 */
export function apiRoute<B = undefined, Q = undefined>(opts: RouteOptions<B, Q>) {
  return async (req: NextRequest, segment: { params: Promise<Params> }) => {
    try {
      if (MUTATING.has(req.method)) assertSameOrigin(req);

      const actor = await getActorOrNull();
      if (!actor) throw unauthenticated();
      if (!opts.allowDuringSetup) {
        if (actor.mustChangePassword) {
          throw new AppError("PASSWORD_CHANGE_REQUIRED", "errors.passwordChangeRequired");
        }
        if (needsMfaEnrollment(actor)) {
          throw new AppError("MFA_REQUIRED", "errors.mfaRequired");
        }
      }
      if (!rateLimit(`api:${actor.id}`, 240, 60_000)) {
        throw new AppError("RATE_LIMITED", "errors.rateLimited");
      }
      if (opts.permission) await requirePermission(actor, opts.permission);

      let body = undefined as B;
      if (opts.body) {
        const raw = await req.json().catch(() => {
          throw new AppError("VALIDATION", "errors.invalidJson");
        });
        body = opts.body.parse(raw);
      }
      let query = undefined as Q;
      if (opts.query) {
        query = opts.query.parse(Object.fromEntries(req.nextUrl.searchParams));
      }

      const data = await opts.handler({
        req,
        actor,
        body,
        query,
        params: await segment.params,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
      });
      if (data instanceof Response) return data; // e.g. file downloads
      return NextResponse.json({ data: data ?? null }, { status: opts.status ?? 200 });
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code === "INTERNAL") console.error("[api]", req.method, req.nextUrl.pathname, err);
      return errorResponse(appErr);
    }
  };
}
