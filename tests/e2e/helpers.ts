/** Shared helpers for live-server tests. Records they create are named "E2E ..." so they're easy to spot. */
import { expect } from "vitest";

export const BASE = process.env.E2E_BASE_URL;
export const uniq = () => Math.random().toString(36).slice(2, 9);

export async function signIn(email: string, password = process.env.SEED_USER_PASSWORD ?? "") {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE! },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, `sign-in ${email}`).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** Management tests need an admin who can skip 2FA, which only local development allows. */
export const canManage = process.env.AUTH_MFA_ENFORCED === "false";

export const session = {
  admin: () => signIn("admin@entitygate.test"),
  head: () => signIn("head@entitygate.test"),
  am1: () => signIn("am1@entitygate.test"),
  am2: () => signIn("am2@entitygate.test"),
  hr: () => signIn("hr@entitygate.test"),
  finance: () => signIn("finance@entitygate.test"),
  ops: () => signIn("ops@entitygate.test"),
  exec: () => signIn("exec@entitygate.test"),
  auditor: () => signIn("auditor@entitygate.test"),
};

/** Calls /api/v1 and returns status + data. */
export async function api(cookie: string, path: string, method = "GET", json?: unknown) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const payload = await res.json().catch(() => null);
  return { status: res.status, data: payload?.data, error: payload?.error };
}
