import { apiRoute } from "@/server/api/route";
import { rolePermissionsSchema } from "@/server/modules/access/schema";
import { updateRolePermissions } from "@/server/modules/access/service";

export const PUT = apiRoute({
  permission: "role:manage",
  body: rolePermissionsSchema,
  handler: ({ actor, body, params }) => updateRolePermissions(actor, String(params.key), body.permissions),
});
