import { apiRoute } from "@/server/api/route";
import { invalid } from "@/server/errors";
import { saveAttachment } from "@/server/modules/attachments/service";

/** multipart/form-data with a single "file" field. */
export const POST = apiRoute({
  status: 201,
  handler: async ({ req, actor }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw invalid("errors.fileField");
    return saveAttachment(actor, file);
  },
});
