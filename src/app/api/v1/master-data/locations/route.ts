import { apiRoute } from "@/server/api/route";
import { createLocation, locationSchema } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: locationSchema,
  status: 201,
  handler: ({ actor, body }) => createLocation(actor, body),
});
