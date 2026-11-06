import { apiRoute } from "@/server/api/route";
import { userOverridesSchema } from "@/server/modules/access/schema";
import { updateUserOverrides } from "@/server/modules/access/service";

export const PUT = apiRoute({
  permission: "user:manage",
  body: userOverridesSchema,
  handler: ({ actor, body, params }) => updateUserOverrides(actor, String(params.id), body),
});
