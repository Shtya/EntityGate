import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSIONS, ROLES, type PermissionKey, type RoleKey } from "@/server/rbac/catalog";
import { buildPermissionSet, can, effectivePermissions, clientIdFilter, clientRowFilter, inScope, needsMfaEnrollment } from "@/server/rbac/policy";
import { __resetRateLimits, rateLimit } from "@/server/api/rate-limit";
import { shortIp } from "@/lib/utils";

const actorWith = (...roles: RoleKey[]) => ({
  permissions: buildPermissionSet(roles.map((r) => ROLES[r].permissions)),
});

const WRITE_ACTIONS = /:(create|update|manage|archive|assign|approve|issue|void|record|reconcile|close|reopen|raise|import|export)$/;

describe("permission catalog integrity", () => {
  it.each(Object.keys(ROLES) as RoleKey[])("%s only references known permissions, no duplicates", (role) => {
    const perms = ROLES[role].permissions;
    for (const p of perms) expect(PERMISSIONS).toHaveProperty(p);
    expect(new Set(perms).size).toBe(perms.length);
  });
  it("keys follow resource:action", () => {
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z_]+:[a-z_]+$/);
  });
});

describe("deny by default", () => {
  it("null actor and empty roles can do nothing", () => {
    expect(can(null, "client:read")).toBe(false);
    expect(can({ permissions: new Set() }, "client:read")).toBe(false);
  });
  it("roles union their permissions", () => {
    const a = actorWith("OPS_SUPERVISOR", "FINANCE");
    expect(can(a, "task:read_all")).toBe(true); // from ops
    expect(can(a, "invoice:approve")).toBe(true); // from finance
    expect(can(a, "user:manage")).toBe(false);
  });
});

describe("role boundaries from the SRS", () => {
  it("only Finance (and Admin) can change invoices or payments (BR-03, FIN-04)", () => {
    const finEdits: PermissionKey[] = ["invoice:approve", "invoice:issue", "invoice:void", "payment:record", "payment:reconcile"];
    for (const role of Object.keys(ROLES) as RoleKey[]) {
      const expected = role === "FINANCE" || role === "ADMIN";
      for (const p of finEdits) expect(can(actorWith(role), p), `${role} ${p}`).toBe(expected);
    }
  });
  it("Executive and Auditor are read-only", () => {
    for (const role of ["EXECUTIVE", "AUDITOR"] as RoleKey[]) {
      const writes = ROLES[role].permissions.filter((p) => WRITE_ACTIONS.test(p) && p !== "report:export");
      expect(writes, role).toEqual([]);
    }
  });
  it("only Auditor and Admin read the audit log", () => {
    const readers = (Object.keys(ROLES) as RoleKey[]).filter((r) => can(actorWith(r), "audit:read"));
    expect(readers.sort()).toEqual(["ADMIN", "AUDITOR"]);
  });
  it("salary and identity data are restricted (SRS §3)", () => {
    expect(can(actorWith("ACCOUNT_MANAGER"), "compensation:read")).toBe(false);
    expect(can(actorWith("ACCOUNT_MANAGER"), "employee:read_sensitive")).toBe(false);
    expect(can(actorWith("OPS_SUPERVISOR"), "compensation:read")).toBe(false);
    expect(can(actorWith("HR"), "employee:read_sensitive")).toBe(true);
  });
  it("account managers are scoped to assigned clients", () => {
    expect(can(actorWith("ACCOUNT_MANAGER"), "client:read_all")).toBe(false);
    expect(can(actorWith("DEPT_HEAD"), "client:read_all")).toBe(true);
  });
  it("privileged roles require MFA", () => {
    expect(ROLES.ADMIN.requiresMfa).toBe(true);
    expect(ROLES.FINANCE.requiresMfa).toBe(true);
    expect(ROLES.ACCOUNT_MANAGER.requiresMfa).toBe(false);
  });
});

describe("MFA enrollment gate", () => {
  it("blocks only when required and not enabled", () => {
    expect(needsMfaEnrollment({ mfaRequired: true, twoFactorEnabled: false })).toBe(true);
    expect(needsMfaEnrollment({ mfaRequired: true, twoFactorEnabled: true })).toBe(false);
    expect(needsMfaEnrollment({ mfaRequired: false, twoFactorEnabled: false })).toBe(false);
  });
});

describe("client scope (UAT-01)", () => {
  const assigned = { kind: "assigned" as const, clientIds: ["A"] };
  it("assigned scope limits queries and membership", () => {
    expect(clientIdFilter(assigned)).toEqual({ clientId: { in: ["A"] } });
    expect(clientRowFilter(assigned)).toEqual({ id: { in: ["A"] } });
    expect(inScope(assigned, "A")).toBe(true);
    expect(inScope(assigned, "B")).toBe(false);
    expect(inScope(assigned, null)).toBe(false);
  });
  it("assigned scope with no clients matches nothing (not everything)", () => {
    expect(clientIdFilter({ kind: "assigned", clientIds: [] })).toEqual({ clientId: { in: [] } });
  });
  it("all scope adds no filter", () => {
    expect(clientIdFilter({ kind: "all" })).toEqual({});
    expect(inScope({ kind: "all" }, "anything")).toBe(true);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit within the window, then blocks, then recovers", () => {
    __resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0 + i)).toBe(true);
    expect(rateLimit("k", 3, 1000, t0 + 10)).toBe(false);
    expect(rateLimit("k", 3, 1000, t0 + 1500)).toBe(true);
  });
});

describe("shortIp (audit display)", () => {
  it.each([
    [null, "—"],
    ["127.0.0.1", "127.0.0.1"],
    ["0000:0000:0000:0000:0000:0000:0000:0001", "::1"],
    ["0000:0000:0000:0000:0000:0000:0000:0000", "::"],
    ["2001:0db8:0000:0000:0000:0000:0000:0000", "2001:db8::"],
    ["100a:0000:0000:0000:0000:0000:0000:0010", "100a::10"],
  ])("%s → %s", (input, output) => {
    expect(shortIp(input)).toBe(output);
  });
});

describe("effective permissions", () => {
  const role = { key: "AUDITOR", permissions: ["user:read", "audit:read"] };
  it("is what the roles give when there are no overrides", () => {
    expect([...effectivePermissions([role], [])].sort()).toEqual(["audit:read", "user:read"]);
  });
  it("adds a page for one person without touching their role", () => {
    expect(effectivePermissions([role], [{ permission: "invoice:read", effect: "ALLOW" }]).has("invoice:read")).toBe(true);
  });
  it("blocks a page for one person even though their role allows it", () => {
    expect(effectivePermissions([role], [{ permission: "audit:read", effect: "DENY" }]).has("audit:read")).toBe(false);
  });
  it("a role with no permissions gets nothing", () => {
    expect(effectivePermissions([{ key: "AUDITOR", permissions: [] }], []).size).toBe(0);
  });
  it("administrators always have everything, whatever the database says", () => {
    const admin = effectivePermissions([{ key: "ADMIN", permissions: [] }], [{ permission: "user:read", effect: "DENY" }]);
    expect(admin.size).toBe(ALL_PERMISSIONS.length);
    expect(admin.has("user:read")).toBe(true);
  });
  it("every permission appears in exactly one group", () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect(grouped.slice().sort()).toEqual(ALL_PERMISSIONS.slice().sort());
  });
});
