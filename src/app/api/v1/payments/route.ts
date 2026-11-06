import { apiRoute } from "@/server/api/route";
import { listPaymentsQuery, paymentSchema } from "@/server/modules/billing/schema";
import { listPayments, recordPayment } from "@/server/modules/billing/service";

export const GET = apiRoute({
  permission: "payment:read",
  query: listPaymentsQuery,
  handler: ({ query }) => listPayments(query),
});

export const POST = apiRoute({
  permission: "payment:record",
  body: paymentSchema,
  status: 201,
  handler: ({ actor, body }) => recordPayment(actor, body),
});
