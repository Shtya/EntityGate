import { apiRoute } from "@/server/api/route";
import { actOnNotification, actSchema } from "@/server/modules/notifications/service";

export const POST = apiRoute({
  body: actSchema,
  handler: ({ actor, body, params }) => actOnNotification(actor, String(params.id), body),
});
