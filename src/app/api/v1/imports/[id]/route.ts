import { apiRoute } from "@/server/api/route";
import { getImportJob } from "@/server/modules/imports/service";

export const GET = apiRoute({
  permission: "employee:import",
  handler: ({ params }) => getImportJob(String(params.id)),
});
