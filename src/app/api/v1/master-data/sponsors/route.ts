import { apiRoute } from "@/server/api/route";
import { createSponsor, sponsorSchema } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: sponsorSchema,
  status: 201,
  handler: ({ actor, body }) => createSponsor(actor, body),
});
