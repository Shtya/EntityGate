import { apiRoute } from "@/server/api/route";
import { resetUserTwoFactor } from "@/server/modules/users/service";

export const POST = apiRoute({
  permission: "user:manage",
  handler: ({ actor, params }) => resetUserTwoFactor(actor, String(params.id)),
});
