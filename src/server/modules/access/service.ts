import "server-only";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { forbidden, notFound } from "@/server/errors";
import { ADMIN_ROLE, can, isAdmin, type Actor } from "@/server/rbac/policy";
import type { PermissionKey } from "@/server/rbac/catalog";
import type { UserOverridesInput } from "./schema";

/** You can't hand out access you don't have yourself. Removing access is always allowed. */
function assertCanGrant(actor: Actor, added: string[]) {
  if (added.some((p) => !can(actor, p as PermissionKey))) throw forbidden("errors.cannotGrant");
}

export async function updateRolePermissions(actor: Actor, roleKey: string, permissions: string[]) {
  if (roleKey === ADMIN_ROLE) throw forbidden("errors.adminAllAccess");
  const role = await db.role.findUnique({
    where: { key: roleKey },
    select: { id: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) throw notFound();

  const before = role.permissions.map((p) => p.permission.key).sort();
  const next = [...new Set(permissions)].sort();
  assertCanGrant(actor, next.filter((p) => !before.includes(p)));
  if (!isAdmin(actor) && actor.roles.some((r) => r === roleKey)) throw forbidden("errors.selfPermissions");

  const rows = await db.permission.findMany({ where: { key: { in: next } }, select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({ data: rows.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await writeAudit(tx, {
      actorId: actor.id,
      entityType: "role",
      entityId: roleKey,
      action: "permissions_update",
      before: { permissions: before },
      after: { permissions: next },
    });
  });
  return { permissions: next };
}

export async function updateUserOverrides(actor: Actor, userId: string, input: UserOverridesInput) {
  // Nobody changes their own access, administrators included: it needs a second person, and it's audited.
  if (userId === actor.id) throw forbidden("errors.selfPermissions");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      userRoles: { select: { role: { select: { key: true } } } },
      permissionOverrides: { select: { effect: true, permission: { select: { key: true } } } },
    },
  });
  if (!user) throw notFound("errors.userNotFound");
  if (user.userRoles.some((r) => r.role.key === ADMIN_ROLE)) throw forbidden("errors.adminAllAccess");

  const format = (rows: { permission: string; effect: string }[]) => rows.map((o) => `${o.effect} ${o.permission}`).sort();
  const before = user.permissionOverrides.map((o) => ({ permission: o.permission.key, effect: o.effect as string }));
  const beforeAllows = before.filter((o) => o.effect === "ALLOW").map((o) => o.permission);
  assertCanGrant(actor, input.overrides.filter((o) => o.effect === "ALLOW" && !beforeAllows.includes(o.permission)).map((o) => o.permission));

  const rows = await db.permission.findMany({ where: { key: { in: input.overrides.map((o) => o.permission) } }, select: { id: true, key: true } });
  const idOf = new Map(rows.map((p) => [p.key, p.id]));
  await db.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId } });
    await tx.userPermission.createMany({
      data: input.overrides.map((o) => ({ userId, permissionId: idOf.get(o.permission)!, effect: o.effect })),
    });
    await writeAudit(tx, {
      actorId: actor.id,
      entityType: "user",
      entityId: userId,
      action: "permissions_update",
      before: { overrides: format(before) },
      after: { overrides: format(input.overrides) },
    });
  });
  return { overrides: input.overrides };
}
