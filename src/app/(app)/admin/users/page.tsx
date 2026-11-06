import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listUsers } from "@/server/modules/users/service";
import { db } from "@/server/db";
import { Forbidden } from "@/components/patterns/forbidden";
import { UsersView } from "./users-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("users") };
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const actor = await getActor();
  if (!can(actor, "user:read")) return <Forbidden />;

  const sp = await searchParams;
  const status = sp.status === "ACTIVE" || sp.status === "SUSPENDED" || sp.status === "DEACTIVATED" ? sp.status : undefined;
  const [users, roles] = await Promise.all([
    listUsers({ q: sp.q?.slice(0, 100), status }),
    db.role.findMany({
      select: { key: true, requiresMfa: true, permissions: { select: { permission: { select: { key: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <UsersView
      currentUserId={actor.id}
      canManage={can(actor, "user:manage")}
      roles={roles.map((r) => ({ key: r.key, requiresMfa: r.requiresMfa }))}
      rolePermissions={Object.fromEntries(roles.map((r) => [r.key, r.permissions.map((p) => p.permission.key)]))}
      filter={{ q: sp.q ?? "", status: status ?? "" }}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        title: u.title,
        phone: u.phone,
        status: u.status,
        twoFactorEnabled: u.twoFactorEnabled,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        roles: u.userRoles.map((r) => r.role.key),
        overrides: u.permissionOverrides.map((o) => ({ permission: o.permission.key, effect: o.effect })),
      }))}
    />
  );
}
