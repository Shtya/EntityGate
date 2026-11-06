import "server-only";
import { randomBytes } from "node:crypto";
import { APIError } from "better-auth/api";
import type { Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/password";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { ADMIN_ROLE, isAdmin, type Actor } from "@/server/rbac/policy";
import type { ChangePasswordInput, CreateUserInput, UpdateUserInput } from "./schema";

const userSelect = {
  id: true,
  name: true,
  email: true,
  title: true,
  phone: true,
  status: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { key: true, name: true } } } },
  permissionOverrides: { select: { effect: true, permission: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export async function listUsers(filter: { q?: string; status?: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" }) {
  return db.user.findMany({
    where: {
      status: filter.status,
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { email: { contains: filter.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: userSelect,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

/** Human-friendly temporary password: 4 groups, no ambiguous chars. */
function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

async function roleIds(keys: string[]) {
  const roles = await db.role.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  if (roles.length !== new Set(keys).size) throw invalid("errors.unknownRole");
  return roles;
}

/**
 * Creates a user with a one-time temporary password (returned once, never stored in plain text).
 * Public sign-up is disabled; this is the only way accounts are created.
 */
export async function createUser(actor: Actor, input: CreateUserInput) {
  if (!isAdmin(actor) && input.roles.includes(ADMIN_ROLE)) throw forbidden("errors.adminOnly");
  const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) throw conflict("errors.emailExists");

  const roles = await roleIds(input.roles);
  const password = temporaryPassword();
  const hash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        title: input.title || null,
        phone: input.phone || null,
        emailVerified: true,
        mustChangePassword: true,
        userRoles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: userSelect,
    });
    await tx.account.create({
      data: { userId: u.id, accountId: u.id, providerId: "credential", password: hash },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      entityType: "user",
      entityId: u.id,
      action: "create",
      after: { name: u.name, email: u.email, roles: input.roles },
    });
    return u;
  });

  return { user, temporaryPassword: password };
}

export async function updateUser(actor: Actor, id: string, input: UpdateUserInput) {
  const before = await db.user.findUnique({ where: { id }, select: userSelect });
  if (!before) throw notFound("errors.userNotFound");
  if (!isAdmin(actor)) {
    // user:manage can be granted to non-admins now, so these block self-promotion and admin takeover.
    if (id === actor.id && input.roles) throw forbidden("errors.selfPermissions");
    if (before.userRoles.some((r) => r.role.key === ADMIN_ROLE) || input.roles?.includes(ADMIN_ROLE)) throw forbidden("errors.adminOnly");
  }
  if (id === actor.id && input.status && input.status !== "ACTIVE") {
    throw invalid("errors.selfSuspend");
  }
  if (id === actor.id && input.roles && !input.roles.includes("ADMIN") && before.userRoles.some((r) => r.role.key === "ADMIN")) {
    throw invalid("errors.selfDemote");
  }

  const roles = input.roles ? await roleIds(input.roles) : null;

  return db.$transaction(async (tx) => {
    if (roles) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
    }
    const after = await tx.user.update({
      where: { id },
      data: { name: input.name, title: input.title, phone: input.phone, status: input.status },
      select: userSelect,
    });
    // Suspending/deactivating revokes all live sessions immediately.
    if (input.status && input.status !== "ACTIVE") await tx.session.deleteMany({ where: { userId: id } });

    await writeAudit(tx, {
      actorId: actor.id,
      entityType: "user",
      entityId: id,
      action: input.status && input.status !== before.status ? `status:${input.status.toLowerCase()}` : "update",
      before: { name: before.name, title: before.title, phone: before.phone, status: before.status, roles: before.userRoles.map((r) => r.role.key) },
      after: { name: after.name, title: after.title, phone: after.phone, status: after.status, roles: after.userRoles.map((r) => r.role.key) },
    });
    return after;
  });
}

export async function resetUserPassword(actor: Actor, id: string) {
  const user = await db.user.findUnique({ where: { id }, select: { id: true, userRoles: { select: { role: { select: { key: true } } } } } });
  if (!user) throw notFound("errors.userNotFound");
  if (!isAdmin(actor) && user.userRoles.some((r) => r.role.key === ADMIN_ROLE)) throw forbidden("errors.adminOnly");
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
      where: { userId: id, providerId: "credential" },
      data: { password: hash },
    });
    if (updated.count === 0) {
      await tx.account.create({ data: { userId: id, accountId: id, providerId: "credential", password: hash } });
    }
    await tx.user.update({ where: { id }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: id } });
    await writeAudit(tx, { actorId: actor.id, entityType: "user", entityId: id, action: "password_reset" });
  });
  return { temporaryPassword: password };
}

export async function listRolesWithPermissions() {
  return db.role.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      requiresMfa: true,
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { userRoles: true } },
    },
  });
}

export async function changeOwnPassword(actor: Actor, input: ChangePasswordInput, requestHeaders: Headers) {
  try {
    await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
      headers: requestHeaders,
    });
  } catch (err) {
    if (err instanceof APIError) throw invalid("errors.wrongCurrentPassword");
    throw err;
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { mustChangePassword: false } });
    await writeAudit(tx, { actorId: actor.id, entityType: "user", entityId: actor.id, action: "password_change" });
  });
}
