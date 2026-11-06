import { apiRoute } from "@/server/api/route";
import { masterData } from "@/server/modules/master-data/service";

export const GET = apiRoute({
  permission: "master_data:manage",
  handler: () => masterData(),
});
