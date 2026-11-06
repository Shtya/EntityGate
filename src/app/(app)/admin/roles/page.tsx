import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { listRolesWithPermissions } from "@/server/modules/users/service";
import { Forbidden } from "@/components/patterns/forbidden";
import { PageHeader } from "@/components/patterns/page-header";
import { RolesMatrix } from "./roles-matrix";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("roles") };
}

export default async function RolesPage() {
  const actor = await getActor();
  if (!can(actor, "role:read")) return <Forbidden />;
  const t = await getTranslations("rolesPage");
  const roles = await listRolesWithPermissions();

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      <RolesMatrix
        canManage={can(actor, "role:manage")}
        held={[...actor.permissions]}
        ownRoles={actor.roles}
        isAdmin={actor.roles.includes("ADMIN")}
        roles={roles.map((r) => ({
          key: r.key,
          requiresMfa: r.requiresMfa,
          userCount: r._count.userRoles,
          permissions: r.permissions.map((p) => p.permission.key),
        }))}
      />
    </>
  );
}
