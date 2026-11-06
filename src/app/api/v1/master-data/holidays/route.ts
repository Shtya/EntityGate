import { apiRoute } from "@/server/api/route";
import { createHoliday, holidaySchema } from "@/server/modules/master-data/service";

export const POST = apiRoute({
  permission: "master_data:manage",
  body: holidaySchema,
  status: 201,
  handler: ({ actor, body }) => createHoliday(actor, body),
});
