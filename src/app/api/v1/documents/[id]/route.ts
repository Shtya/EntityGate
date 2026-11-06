import { apiRoute } from "@/server/api/route";
import { archiveDocument } from "@/server/modules/employees/service";

export const DELETE = apiRoute({
  permission: "document:manage",
  handler: ({ actor, params }) => archiveDocument(actor, String(params.id)),
});
