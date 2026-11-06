import { apiRoute } from "@/server/api/route";
import { getCase } from "@/server/modules/operations/service";

export const GET = apiRoute({
  permission: "case:read",
  handler: ({ actor, params }) => getCase(actor, String(params.id)),
});
