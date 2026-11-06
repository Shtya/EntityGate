import { apiRoute } from "@/server/api/route";
import { endAssignment } from "@/server/modules/clients/service";

export const DELETE = apiRoute({
  permission: "client:assign",
  handler: ({ actor, params }) => endAssignment(actor, String(params.id), String(params.assignmentId)),
});
