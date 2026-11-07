/** The clear-data guards, and admin reset of a lost 2FA device. The wipe itself is tested with a rollback. */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 120_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());

describe.skipIf(!BASE || !canManage)("system settings", () => {
  it("refuses to clear data without an administrator, the phrase and the right password", async () => {
    const clients = await db.client.count();
    // Everyone else is blocked, even with a correct password.
    for (const cookie of [await session.finance(), await session.head(), await session.exec()]) {
      expect((await api(cookie, "/system/clear-data", "POST", { confirm: "CLEAR", password: process.env.SEED_USER_PASSWORD })).status).toBe(403);
    }
    const admin = await session.admin();
    const noPhrase = await api(admin, "/system/clear-data", "POST", { confirm: "yes", password: process.env.SEED_USER_PASSWORD });
    expect(noPhrase.status).toBe(422);
    const wrong = await api(admin, "/system/clear-data", "POST", { confirm: "CLEAR", password: `wrong-${uniq()}` });
    expect(wrong.status).toBe(422);
    expect(await db.client.count()).toBe(clients);
    expect(await db.auditEvent.count({ where: { action: "clear_denied", createdAt: { gte: new Date(Date.now() - 120_000) } } })).toBeGreaterThan(0);
  });

  it("an admin can clear someone's lost 2FA, and the person must sign in again", async () => {
    const admin = await session.admin();
    const target = await db.user.findUniqueOrThrow({ where: { email: "auditor@entitygate.test" } });
    const session0 = await session.auditor();
    await db.user.update({ where: { id: target.id }, data: { twoFactorEnabled: true } });
    await db.twoFactor.create({ data: { userId: target.id, secret: "x", backupCodes: "x" } });

    expect((await api(await session.hr(), `/users/${target.id}/reset-two-factor`, "POST", {})).status).toBe(403);
    expect((await api(admin, `/users/${target.id}/reset-two-factor`, "POST", {})).status).toBe(200);

    const after = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.twoFactorEnabled).toBe(false);
    expect(await db.twoFactor.count({ where: { userId: target.id } })).toBe(0);
    expect((await api(session0, "/dashboard")).status).toBe(401);
    expect(await db.auditEvent.count({ where: { entityId: target.id, action: "two_factor_reset" } })).toBeGreaterThan(0);
  });

  // Other tests sign in as this person, which 2FA left on by a failed run would break.
  afterAll(async () => {
    const target = await db.user.findUnique({ where: { email: "auditor@entitygate.test" } });
    if (!target) return;
    await db.twoFactor.deleteMany({ where: { userId: target.id } });
    await db.user.update({ where: { id: target.id }, data: { twoFactorEnabled: false } });
  });
});
