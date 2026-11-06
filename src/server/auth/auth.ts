import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { hashPassword, verifyPassword } from "@/lib/password";
import { db } from "@/server/db";

export const auth = betterAuth({
  appName: "EntityGate",
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Internal system: accounts are created by administrators only.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  session: {
    expiresIn: 60 * 60 * 12, // 12h working session
    updateAge: 60 * 60, // refresh at most hourly
  },
  user: {
    additionalFields: {
      status: { type: "string", input: false, defaultValue: "ACTIVE" },
      title: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, input: false, defaultValue: "en" },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: Number(process.env.AUTH_SIGNIN_RATE_LIMIT) || 8 },
      "/two-factor/verify-totp": { window: 60, max: 8 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { status: true },
          });
          // Suspended / deactivated users can't start sessions.
          if (!user || user.status !== "ACTIVE") return false;
          return { data: session };
        },
        after: async (session, ctx) => {
          // Sessions are also created for 2FA enrollment and password changes; only real sign-ins are logged.
          const path = ctx?.path ?? "";
          const isPasswordStep = path === "/sign-in/email";
          if (!isPasswordStep && !path.startsWith("/two-factor/verify-")) return;

          const user = await db.user.findUnique({ where: { id: session.userId }, select: { twoFactorEnabled: true } });
          // With 2FA on, the password step isn't a completed sign-in: the second factor is still pending.
          const pending = isPasswordStep && user?.twoFactorEnabled === true;
          // Enrollment confirms a code too, but the user's existing session stays the sign-in of record.
          if (!isPasswordStep && !ctx?.headers?.get("cookie")?.includes("two_factor")) return;

          await db.$transaction([
            ...(pending ? [] : [db.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } })]),
            db.auditEvent.create({
              data: {
                actorId: session.userId,
                entityType: "user",
                entityId: session.userId,
                action: pending ? "password_verified" : "login",
                ipAddress: session.ipAddress ?? null,
                userAgent: session.userAgent ?? null,
              },
            }),
          ]);
        },
      },
    },
  },
  // Account changes go through our audited API, not these endpoints. Server-side calls still work.
  disabledPaths: ["/sign-up/email", "/update-user", "/change-email", "/change-password", "/set-password", "/delete-user", "/request-password-reset", "/reset-password"],
  plugins: [twoFactor({ issuer: "EntityGate" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
