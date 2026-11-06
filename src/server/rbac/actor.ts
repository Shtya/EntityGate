import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { forbidden, unauthenticated } from "@/server/errors";
import { todayDate } from "@/lib/dates";
import type { PermissionKey, RoleKey } from "./catalog";
import { can, effectivePermissions, type Actor, type ClientScope } from "./policy";

export type { Actor, ClientScope } from "./policy";

/** AUTH_MFA_ENFORCED=false eases local testing. Production always enforces, whatever the env says. */
function mfaEnforced() {
  return process.env.NODE_ENV === "production" || process.env.AUTH_MFA_ENFORCED !== "false";
}

async function loadActor(userId: string): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      status: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      permissionOverrides: { select: { effect: true, permission: { select: { key: true } } } },
      userRoles: {
        select: {
          role: {
            select: {
              key: true,
              requiresMfa: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const roles = user.userRoles.map((ur) => ur.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    roles: roles.map((r) => r.key as RoleKey),
    permissions: effectivePermissions(
      roles.map((r) => ({ key: r.key, permissions: r.permissions.map((p) => p.permission.key) })),
      user.permissionOverrides.map((o) => ({ permission: o.permission.key, effect: o.effect })),
    ),
    mfaRequired: mfaEnforced() && roles.some((r) => r.requiresMfa),
    twoFactorEnabled: user.twoFactorEnabled,
    mustChangePassword: user.mustChangePassword,
  };
}

/** Current signed-in actor (memoized per request), or null. */
export const getActorOrNull = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return loadActor(session.user.id);
});

export async function getActor(): Promise<Actor> {
  const actor = await getActorOrNull();
  if (!actor) throw unauthenticated();
  return actor;
}

/**
 * Enforce a permission. Denials are written to the audit log (UAT-07) so that
 * forbidden attempts made directly against the API are traceable.
 */
export async function requirePermission(
  actor: Actor,
  permission: PermissionKey,
  context?: { entityType?: string; entityId?: string },
): Promise<void> {
  if (can(actor, permission)) return;
  const h = await headers();
  await writeAudit(db, {
    actorId: actor.id,
    entityType: context?.entityType ?? permission.split(":")[0],
    entityId: context?.entityId ?? "-",
    action: "denied",
    after: { permission },
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });
  throw forbidden();
}

/** Clients the actor may see (memoized per request). */
export const getClientScope = cache(async (): Promise<ClientScope> => {
  const actor = await getActor();
  if (can(actor, "client:read_all")) return { kind: "all" };
  const today = todayDate();
  const rows = await db.accountAssignment.findMany({
    where: {
      userId: actor.id,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }],
    },
    select: { clientId: true },
  });
  return { kind: "assigned", clientIds: [...new Set(rows.map((r) => r.clientId))] };
});
