import { apiRoute } from "@/server/api/route";
import { updateUserSchema } from "@/server/modules/users/schema";
import { updateUser } from "@/server/modules/users/service";

export const PATCH = apiRoute({
  permission: "user:manage",
  body: updateUserSchema,
  handler: ({ actor, body, params }) => updateUser(actor, String(params.id), body),
});
