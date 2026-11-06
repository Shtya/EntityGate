import { apiRoute } from "@/server/api/route";
import { markAllRead } from "@/server/modules/notifications/service";

export const POST = apiRoute({
  handler: ({ actor }) => markAllRead(actor),
});
