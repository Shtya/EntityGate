import { apiRoute } from "@/server/api/route";
import { recentNotifications } from "@/server/modules/notifications/service";

export const GET = apiRoute({
  handler: ({ actor }) => recentNotifications(actor),
});
