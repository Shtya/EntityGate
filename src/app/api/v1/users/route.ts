import { apiRoute } from "@/server/api/route";
import { createUserSchema, listUsersQuery } from "@/server/modules/users/schema";
import { createUser, listUsers } from "@/server/modules/users/service";

export const GET = apiRoute({
  permission: "user:read",
  query: listUsersQuery,
  handler: ({ query }) => listUsers(query),
});

export const POST = apiRoute({
  permission: "user:manage",
  body: createUserSchema,
  status: 201,
  handler: ({ actor, body }) => createUser(actor, body),
});
