import { headers } from "next/headers";
import { apiRoute } from "@/server/api/route";
import { changePasswordSchema } from "@/server/modules/users/schema";
import { changeOwnPassword } from "@/server/modules/users/service";

export const POST = apiRoute({
  allowDuringSetup: true,
  body: changePasswordSchema,
  handler: async ({ actor, body }) => {
    await changeOwnPassword(actor, body, await headers());
    return { ok: true };
  },
});
