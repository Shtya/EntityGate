import { apiRoute } from "@/server/api/route";
import { receivables } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "invoice:read",
  handler: () => receivables(),
});
