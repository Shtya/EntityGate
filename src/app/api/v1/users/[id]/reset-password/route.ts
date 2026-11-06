import { apiRoute } from "@/server/api/route";
import { resetUserPassword } from "@/server/modules/users/service";

export const POST = apiRoute({
  permission: "user:manage",
  handler: ({ actor, params }) => resetUserPassword(actor, String(params.id)),
});
