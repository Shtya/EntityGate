import { apiRoute } from "@/server/api/route";
import { documentSchema } from "@/server/modules/employees/schema";
import { addDocument } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "document:manage",
  status: 201,
  handler: async ({ actor, req }) => {
    const raw = await req.json();
    const owner = Object.fromEntries(req.nextUrl.searchParams);
    return addDocument(actor, documentSchema.parse({ ...raw, ...owner }));
  },
});
