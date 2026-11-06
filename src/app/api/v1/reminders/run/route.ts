import { apiRoute } from "@/server/api/route";
import { runReminders } from "@/server/modules/notifications/engine";

export const POST = apiRoute({
  permission: "reminder_rule:manage",
  handler: () => runReminders(),
});
