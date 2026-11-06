import { apiRoute } from "@/server/api/route";
import { auditQuery, listAuditEvents } from "@/server/modules/audit/service";

export const GET = apiRoute({
  permission: "audit:read",
  query: auditQuery,
  handler: ({ query }) => listAuditEvents(query),
});
