import { apiRoute } from "@/server/api/route";
import { contactSchema } from "@/server/modules/clients/schema";
import { addContact } from "@/server/modules/clients/service";

export const POST = apiRoute({
  permission: "client:update",
  body: contactSchema,
  status: 201,
  handler: ({ actor, body, params }) => addContact(actor, String(params.id), body),
});
