import { z } from "zod";

export const ROLE_KEYS = [
  "ADMIN",
  "DEPT_HEAD",
  "ACCOUNT_MANAGER",
  "HR",
  "FINANCE",
  "OPS_SUPERVISOR",
  "EXECUTIVE",
  "AUDITOR",
] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "validation.nameRequired").max(120),
  email: z.email("validation.emailInvalid").trim().toLowerCase(),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  roles: z.array(z.enum(ROLE_KEYS)).min(1, "validation.rolesRequired"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  title: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  roles: z.array(z.enum(ROLE_KEYS)).min(1).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "validation.currentRequired"),
    newPassword: z.string().min(10, "validation.passwordShort").max(128),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "validation.passwordSame",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
