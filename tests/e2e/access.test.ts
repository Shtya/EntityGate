/**
 * Permission management against a running server. Pages and APIs follow what's configured.
 * Management calls need a usable admin session, so they run only with AUTH_MFA_ENFORCED=false.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL;
const db = new PrismaClient();
afterAll(() => db.$disconnect());

async function signIn(email: string, password = process.env.SEED_USER_PASSWORD ?? "") {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE! },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status, email).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const call = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", Cookie: cookie, ...init.headers } });
const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;
const setOverride = async (email: string, key: string, effect: "ALLOW" | "DENY") => {
  const permission = await db.permission.findUniqueOrThrow({ where: { key } });
  await db.userPermission.create({ data: { userId: await userId(email), permissionId: permission.id, effect } });
};
const clearOverrides = async (email: string) => db.userPermission.deleteMany({ where: { userId: await userId(email) } });

const canManageHere = process.env.AUTH_MFA_ENFORCED === "false";
const ACTING_ADMIN = "admin@entitygate.test";
const adminCookie = () => signIn(ACTING_ADMIN);

describe.skipIf(!BASE)("permissions drive access (live server)", () => {
  it("granting a person a permission opens that page and API for them only", async () => {
    const email = "am1@entitygate.test";
    const cookie = await signIn(email);
    expect((await call("/api/v1/audit", cookie)).status).toBe(403);
    try {
      await setOverride(email, "audit:read", "ALLOW");
      expect((await call("/api/v1/audit", cookie)).status).toBe(200);
      const other = await signIn("am2@entitygate.test");
      expect((await call("/api/v1/audit", other)).status).toBe(403); // same role, no grant
    } finally {
      await clearOverrides(email);
    }
    expect((await call("/api/v1/audit", cookie)).status).toBe(403); // takes effect immediately
  });

  it("blocking a person closes a page their role allows", async () => {
    const email = "auditor@entitygate.test";
    const cookie = await signIn(email);
    expect((await call("/api/v1/audit", cookie)).status).toBe(200);
    try {
      await setOverride(email, "audit:read", "DENY");
      expect((await call("/api/v1/audit", cookie)).status).toBe(403);
    } finally {
      await clearOverrides(email);
    }
  });

  it("every role can be given or denied the Overview page", async () => {
    const email = "ops@entitygate.test";
    const cookie = await signIn(email);
    const before = await (await call("/", cookie)).text();
    try {
      await setOverride(email, "overview:read", "DENY");
      const after = await (await call("/", cookie)).text();
      // The greeting heading only renders on the real page. Message text can't be used: all of it ships in the payload.
      expect(before).toContain("mt-1 font-display");
      expect(after).not.toContain("mt-1 font-display");
    } finally {
      await clearOverrides(email);
    }
  });

  it("an admin blocked in the database still has everything", async () => {
    if (!canManageHere) return;
    const email = ACTING_ADMIN;
    try {
      await setOverride(email, "audit:read", "DENY");
      expect((await call("/api/v1/audit", await adminCookie())).status).toBe(200);
    } finally {
      await clearOverrides(email);
    }
  });
});

describe.skipIf(!BASE || !canManageHere)("managing permissions (live server)", () => {
  it("an admin changes a role and it applies to everyone in that role, then it's audited", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { key: "OPS_SUPERVISOR" }, include: { permissions: { include: { permission: true } } } });
    const original = role.permissions.map((p) => p.permission.key);
    const admin = await adminCookie();
    const ops = await signIn("ops@entitygate.test");
    expect((await call("/api/v1/audit", ops)).status).toBe(403);
    const since = new Date();
    try {
      const res = await call("/api/v1/roles/OPS_SUPERVISOR/permissions", admin, { method: "PUT", body: JSON.stringify({ permissions: [...original, "audit:read"] }) });
      expect(res.status).toBe(200);
      expect((await call("/api/v1/audit", ops)).status).toBe(200);
      const event = await db.auditEvent.findFirst({ where: { entityId: "OPS_SUPERVISOR", action: "permissions_update", createdAt: { gte: since } } });
      expect(event).not.toBeNull();
    } finally {
      await call("/api/v1/roles/OPS_SUPERVISOR/permissions", admin, { method: "PUT", body: JSON.stringify({ permissions: original }) });
    }
    expect((await call("/api/v1/audit", ops)).status).toBe(403);
  });

  it("an admin sets one person's overrides through the API", async () => {
    const admin = await adminCookie();
    const id = await userId("hr@entitygate.test");
    const hr = await signIn("hr@entitygate.test");
    try {
      const res = await call(`/api/v1/users/${id}/permissions`, admin, { method: "PUT", body: JSON.stringify({ overrides: [{ permission: "role:read", effect: "ALLOW" }] }) });
      expect(res.status).toBe(200);
      expect((await call("/api/v1/roles", hr)).status).toBe(200);
    } finally {
      await clearOverrides("hr@entitygate.test");
    }
  });

  it("the administrator role and administrators can't be restricted", async () => {
    const admin = await adminCookie();
    expect((await call("/api/v1/roles/ADMIN/permissions", admin, { method: "PUT", body: JSON.stringify({ permissions: [] }) })).status).toBe(403);
    const otherAdmin = (await db.user.findFirstOrThrow({ where: { email: { not: ACTING_ADMIN }, userRoles: { some: { role: { key: "ADMIN" } } } } })).id;
    const res = await call(`/api/v1/users/${otherAdmin}/permissions`, admin, { method: "PUT", body: JSON.stringify({ overrides: [{ permission: "audit:read", effect: "DENY" }] }) });
    expect(res.status).toBe(403);
  });

  it("nobody edits their own access", async () => {
    const admin = await adminCookie();
    const self = await userId(ACTING_ADMIN);
    const res = await call(`/api/v1/users/${self}/permissions`, admin, { method: "PUT", body: JSON.stringify({ overrides: [] }) });
    expect(res.status).toBe(403);
  });

  it("rejects unknown permissions", async () => {
    const admin = await adminCookie();
    const res = await call("/api/v1/roles/HR/permissions", admin, { method: "PUT", body: JSON.stringify({ permissions: ["made:up"] }) });
    expect(res.status).toBe(422);
  });
});

describe.skipIf(!BASE)("no escalation for delegated managers (live server)", () => {
  it("someone granted user:manage can't reach admins, promote anyone to admin, or grant what they lack", async () => {
    const email = "head@entitygate.test";
    try {
      await setOverride(email, "user:manage", "ALLOW");
      const head = await signIn(email);
      const hrId = await userId("hr@entitygate.test");
      const adminId = await userId("admin@entitygate.test");
      const body = (o: object) => ({ method: "PATCH", body: JSON.stringify(o) });

      expect((await call(`/api/v1/users/${hrId}`, head, body({ roles: ["ADMIN"] }))).status).toBe(403);
      expect((await call(`/api/v1/users/${adminId}`, head, body({ status: "SUSPENDED" }))).status).toBe(403);
      expect((await call(`/api/v1/users/${adminId}/reset-password`, head, { method: "POST" })).status).toBe(403);
      expect((await call(`/api/v1/users/${await userId(email)}`, head, body({ roles: ["ADMIN"] }))).status).toBe(403);
      const grant = await call(`/api/v1/users/${hrId}/permissions`, head, {
        method: "PUT",
        body: JSON.stringify({ overrides: [{ permission: "invoice:approve", effect: "ALLOW" }] }),
      });
      expect(grant.status).toBe(403);
      expect(await db.userPermission.count({ where: { userId: hrId } })).toBe(0);
      const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(admin.status).toBe("ACTIVE");
    } finally {
      await clearOverrides(email);
    }
  });
});
