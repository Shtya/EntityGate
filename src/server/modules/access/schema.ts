import { z } from "zod";
import { ALL_PERMISSIONS } from "@/server/rbac/catalog";

const permission = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

export const rolePermissionsSchema = z.object({ permissions: z.array(permission) });

export const userOverridesSchema = z.object({
  overrides: z.array(z.object({ permission, effect: z.enum(["ALLOW", "DENY"]) })),
});
export type UserOverridesInput = z.infer<typeof userOverridesSchema>;
