import { apiRoute } from "@/server/api/route";
import { sponsorSchema, updateSponsor } from "@/server/modules/master-data/service";

export const PUT = apiRoute({
  permission: "master_data:manage",
  body: sponsorSchema,
  handler: ({ actor, body, params }) => updateSponsor(actor, String(params.id), body),
});
