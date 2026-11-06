/**
 * API security checks against a running server (UAT-07, IAM-02, NFR-05).
 * Run with:  E2E_BASE_URL=http://localhost:3000 npm test
 * Uses the seeded demo users (password = SEED_USER_PASSWORD).
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/password";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL;
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "";
const db = new PrismaClient();
afterAll(() => db.$disconnect());

async function signIn(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE! },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `sign-in ${email}`).toBe(200);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  expect(cookies.length).toBeGreaterThan(0);
  return cookies.join("; ");
}

const call = (path: string, cookie: string | null, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });

describe.skipIf(!BASE)("API security (live server)", () => {
  it("rejects unauthenticated API calls with 401 JSON", async () => {
    const res = await call("/api/v1/me", null);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects wrong passwords", async () => {
    const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE! },
      body: JSON.stringify({ email: "am1@entitygate.test", password: "definitely-wrong-123" }),
    });
    expect(res.status).toBe(401);
  });

  it("an account manager can read their profile but not admin endpoints", async () => {
    const cookie = await signIn("am1@entitygate.test");
    const me = await call("/api/v1/me", cookie);
    expect(me.status).toBe(200);
    expect((await me.json()).data.roles).toEqual(["ACCOUNT_MANAGER"]);

    const audit = await call("/api/v1/audit", cookie);
    expect(audit.status).toBe(403);
  });

  it("a forbidden write via the API is rejected AND logged (UAT-07)", async () => {
    const cookie = await signIn("am1@entitygate.test");
    const am = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const target = await db.user.findUniqueOrThrow({ where: { email: "hr@entitygate.test" } });
    const since = new Date(Date.now() - 1000);

    const res = await call(`/api/v1/users/${target.id}`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");

    const unchanged = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.status).toBe("ACTIVE");

    const logged = await db.auditEvent.findFirst({
      where: { actorId: am.id, action: "denied", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    expect(logged).not.toBeNull();
    expect((logged!.after as { permission: string }).permission).toBe("user:manage");
  });

  it("blocks cross-origin mutations even with a valid session (CSRF)", async () => {
    const cookie = await signIn("am1@entitygate.test");
    const res = await call("/api/v1/users", cookie, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it("privileged roles without 2FA are blocked from the API (NFR-05)", async () => {
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@entitygate.test" } });
    if (admin.twoFactorEnabled || process.env.AUTH_MFA_ENFORCED === "false") return; // nothing to assert
    const cookie = await signIn("admin@entitygate.test");
    const res = await call("/api/v1/users", cookie);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("MFA_REQUIRED");
  });

  it("validates input and returns field errors (422)", async () => {
    // Dept head can read users but not manage them — use /me-independent validation via audit query params instead.
    const cookie = await signIn("auditor@entitygate.test");
    const res = await call("/api/v1/audit?take=5000", cookie);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details[0].path).toBe("take");
  });

  it("logs exactly one login event per sign-in", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: "ops@entitygate.test" } });
    const since = new Date();
    await signIn("ops@entitygate.test");
    const events = await db.auditEvent.findMany({ where: { actorId: user.id, action: "login", createdAt: { gte: since } } });
    expect(events).toHaveLength(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt!.getTime()).toBeGreaterThanOrEqual(since.getTime());
  });

  it("a temporary password must be replaced before anything else works", async () => {
    const email = "am2@entitygate.test";
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const account = await db.account.findFirstOrThrow({ where: { userId: user.id, providerId: "credential" } });
    const temp = "Temp-password-1234";
    const next = "New-password-5678";
    await db.account.update({ where: { id: account.id }, data: { password: await hashPassword(temp) } });
    await db.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    try {
      const cookie = await signIn(email, temp);
      const blocked = await call("/api/v1/me", cookie);
      expect(blocked.status).toBe(403);
      expect((await blocked.json()).error.code).toBe("PASSWORD_CHANGE_REQUIRED");

      const wrong = await call("/api/v1/me/password", cookie, {
        method: "POST",
        body: JSON.stringify({ currentPassword: "not-the-password", newPassword: next }),
      });
      expect(wrong.status).toBe(422);

      const weak = await call("/api/v1/me/password", cookie, {
        method: "POST",
        body: JSON.stringify({ currentPassword: temp, newPassword: "short" }),
      });
      expect(weak.status).toBe(422);

      const ok = await call("/api/v1/me/password", cookie, {
        method: "POST",
        body: JSON.stringify({ currentPassword: temp, newPassword: next }),
      });
      expect(ok.status).toBe(200);
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);

      const fresh = await signIn(email, next);
      expect((await call("/api/v1/me", fresh)).status).toBe(200);
      const old = await fetch(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: BASE! },
        body: JSON.stringify({ email, password: temp }),
      });
      expect(old.status).toBe(401);
    } finally {
      // Restore the demo user exactly as seeded.
      await db.account.update({ where: { id: account.id }, data: { password: account.password } });
      await db.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
      await db.session.deleteMany({ where: { userId: user.id } });
    }
  });

  it("rejects an impossible calendar date as a 422, not a 500", async () => {
    const cookie = await signIn("auditor@entitygate.test");
    expect((await call("/api/v1/audit?from=2026-02-30", cookie)).status).toBe(422);
  });

  it("treats a sandboxed 'Origin: null' as a blocked request, not a crash", async () => {
    const cookie = await signIn("am1@entitygate.test");
    const res = await call("/api/v1/me/password", cookie, { method: "POST", headers: { Origin: "null" }, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("keeps account changes behind the audited API", async () => {
    const cookie = await signIn("am1@entitygate.test");
    for (const path of ["/update-user", "/change-password", "/sign-up/email", "/delete-user", "/change-email"]) {
      const res = await call(`/api/auth${path}`, cookie, { method: "POST", headers: { Origin: BASE! }, body: JSON.stringify({ name: "x", email: "x@x.co", password: "aaaaaaaaaaaa", currentPassword: "a", newPassword: "aaaaaaaaaaaa", newEmail: "x@x.co" }) });
      expect([403, 404], path).toContain(res.status);
    }
  });

  it("returns errors in the signed-in user's language", async () => {
    const cookie = await signIn("am1@entitygate.test");
    const res = await call("/api/v1/audit", `${cookie}; eg-locale=ar`);
    expect((await res.json()).error.message).toMatch(/[\u0600-\u06FF]/);
  });

  it("stores passwords as argon2 hashes only", async () => {
    const hashes = await db.account.findMany({ where: { providerId: "credential" }, select: { password: true } });
    expect(hashes.length).toBeGreaterThan(0);
    for (const h of hashes) expect(h.password).toMatch(/^\$argon2id\$/);
  });

  it("sends a nonce-based Content-Security-Policy on pages", async () => {
    const res = await fetch(`${BASE}/login`);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("the development admin can sign in", async () => {
    if (!process.env.SEED_ADMIN_EMAIL) return;
    // Sign-in succeeds whether or not they've since turned on 2FA; the session rules are tested elsewhere.
    await signIn(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  });

  it("health endpoint is public and reports DB status", async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
