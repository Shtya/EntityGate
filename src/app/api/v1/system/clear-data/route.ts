import { apiRoute } from "@/server/api/route";
import { clearDataSchema, clearDemoData } from "@/server/modules/system/service";

export const POST = apiRoute({
  permission: "system:reset",
  body: clearDataSchema,
  handler: ({ actor, body }) => clearDemoData(actor, body),
});
