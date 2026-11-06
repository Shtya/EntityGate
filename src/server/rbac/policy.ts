/**
 * Pure authorization logic — no DB, no Next.js — so it can be unit tested.
 * Default principle: deny by default (SRS §3).
 */
import { ALL_PERMISSIONS, type PermissionKey, type RoleKey } from "./catalog";

export interface Actor {
  id: string;
  name: string;
  email: string;
  title: string | null;
  roles: RoleKey[];
  permissions: ReadonlySet<PermissionKey>;
  /** At least one of the actor's roles requires MFA (NFR-05). */
  mfaRequired: boolean;
  twoFactorEnabled: boolean;
  /** Signed in with an admin-issued temporary password. */
  mustChangePassword: boolean;
}

export function can(actor: Pick<Actor, "permissions"> | null | undefined, permission: PermissionKey): boolean {
  if (!actor) return false;
  return actor.permissions.has(permission);
}

export function canAny(actor: Pick<Actor, "permissions"> | null | undefined, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => can(actor, p));
}

/** True when the actor must enroll in 2FA before using protected features. */
export function needsMfaEnrollment(actor: Pick<Actor, "mfaRequired" | "twoFactorEnabled">): boolean {
  return actor.mfaRequired && !actor.twoFactorEnabled;
}

export type ClientScope = { kind: "all" } | { kind: "assigned"; clientIds: string[] };

/** Prisma `where` fragment for a model with a `clientId` column. */
export function clientIdFilter(scope: ClientScope): { clientId?: { in: string[] } } {
  return scope.kind === "all" ? {} : { clientId: { in: scope.clientIds } };
}

/** Prisma `where` fragment for the clients table itself. */
export function clientRowFilter(scope: ClientScope): { id?: { in: string[] } } {
  return scope.kind === "all" ? {} : { id: { in: scope.clientIds } };
}

export function inScope(scope: ClientScope, clientId: string | null | undefined): boolean {
  if (scope.kind === "all") return true;
  if (!clientId) return false;
  return scope.clientIds.includes(clientId);
}

export const ADMIN_ROLE: RoleKey = "ADMIN";

export function isAdmin(actor: Pick<Actor, "roles">): boolean {
  return actor.roles.includes(ADMIN_ROLE);
}

export interface PermissionOverride {
  permission: string;
  effect: "ALLOW" | "DENY";
}

/**
 * What a person can actually do: everything from their roles, plus their grants, minus their blocks.
 * Administrators always have everything, so nobody can lock the system's owners out of it.
 */
export function effectivePermissions(roles: { key: string; permissions: string[] }[], overrides: PermissionOverride[]): Set<PermissionKey> {
  if (roles.some((r) => r.key === ADMIN_ROLE)) return new Set(ALL_PERMISSIONS);
  const set = buildPermissionSet(roles.map((r) => r.permissions));
  for (const o of overrides) if (o.effect === "ALLOW") set.add(o.permission as PermissionKey);
  for (const o of overrides) if (o.effect === "DENY") set.delete(o.permission as PermissionKey);
  return set;
}

export function buildPermissionSet(rolePermissions: string[][]): Set<PermissionKey> {
  const set = new Set<PermissionKey>();
  for (const list of rolePermissions) for (const p of list) set.add(p as PermissionKey);
  return set;
}
