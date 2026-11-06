import { apiRoute } from "@/server/api/route";
import { removeContact } from "@/server/modules/clients/service";

export const DELETE = apiRoute({
  permission: "client:update",
  handler: ({ actor, params }) => removeContact(actor, String(params.id), String(params.contactId)),
});
