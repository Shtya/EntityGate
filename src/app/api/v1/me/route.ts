import { apiRoute } from "@/server/api/route";

export const GET = apiRoute({
  handler: async ({ actor }) => ({
    id: actor.id,
    name: actor.name,
    email: actor.email,
    title: actor.title,
    roles: actor.roles,
    permissions: [...actor.permissions].sort(),
    twoFactorEnabled: actor.twoFactorEnabled,
  }),
});
