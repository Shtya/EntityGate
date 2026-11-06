import { apiRoute } from "@/server/api/route";
import { invalid } from "@/server/errors";
import { validateEmployeeImport } from "@/server/modules/imports/service";

export const POST = apiRoute({
  permission: "employee:import",
  status: 201,
  handler: async ({ actor, req }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw invalid("errors.fileField");
    return validateEmployeeImport(actor, file);
  },
});
