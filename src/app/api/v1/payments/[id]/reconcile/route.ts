import { apiRoute } from "@/server/api/route";
import { z } from "zod";
import { setReconciled } from "@/server/modules/billing/service";

export const POST = apiRoute({
  permission: "payment:reconcile",
  body: z.object({ reconciled: z.boolean() }),
  handler: ({ actor, body, params }) => setReconciled(actor, String(params.id), body.reconciled),
});
