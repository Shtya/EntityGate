import { apiRoute } from "@/server/api/route";
import { listRolesWithPermissions } from "@/server/modules/users/service";

export const GET = apiRoute({
  permission: "role:read",
  handler: () => listRolesWithPermissions(),
});
