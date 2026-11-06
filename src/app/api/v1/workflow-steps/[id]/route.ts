import { apiRoute } from "@/server/api/route";
import { z } from "zod";
import { setStep } from "@/server/modules/employees/service";

export const POST = apiRoute({
  permission: "employee:update",
  body: z.object({ done: z.boolean() }),
  handler: ({ actor, body, params }) => setStep(actor, String(params.id), body.done),
});
