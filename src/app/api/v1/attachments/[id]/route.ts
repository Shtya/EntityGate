import { apiRoute } from "@/server/api/route";
import { readAttachment } from "@/server/modules/attachments/service";

export const GET = apiRoute({
  handler: async ({ actor, params }) => {
    const { meta, data } = await readAttachment(actor, String(params.id));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": meta.mime,
        "Content-Length": String(meta.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  },
});
