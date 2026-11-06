import { apiRoute } from "@/server/api/route";
import { invoiceSchema, listInvoicesQuery } from "@/server/modules/billing/schema";
import { createInvoice, listInvoices } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "invoice:read",
  query: listInvoicesQuery,
  handler: ({ query }) => listInvoices(query),
});

export const POST = apiRoute({
  permission: "invoice:create",
  body: invoiceSchema,
  status: 201,
  handler: ({ actor, body }) => createInvoice(actor, body),
});
