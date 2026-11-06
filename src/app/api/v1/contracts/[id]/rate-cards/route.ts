import { apiRoute } from "@/server/api/route";
import { rateCardSchema } from "@/server/modules/clients/schema";
import { addRateCard } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "contract:manage",
  body: rateCardSchema,
  status: 201,
  handler: ({ actor, body, params }) => addRateCard(actor, String(params.id), body),
});
