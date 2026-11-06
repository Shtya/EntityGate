import { apiRoute } from "@/server/api/route";
import { z } from "zod";
import { globalSearch } from "@/server/modules/search/service";

export const GET = apiRoute({
  query: z.object({ q: z.string().max(200).catch("").default("") }),
  handler: ({ actor, query }) => globalSearch(actor, query.q),
});
