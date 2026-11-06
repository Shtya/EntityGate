import { apiRoute } from "@/server/api/route";
import { getTask } from "@/server/modules/operations/service";

export const GET = apiRoute({
  permission: "task:read",
  handler: ({ actor, params }) => getTask(actor, String(params.id)),
});
