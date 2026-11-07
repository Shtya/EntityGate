import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

// Each reminder run scans the whole database, several times per test.
vi.setConfig({ testTimeout: 180_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());
const admin = session.admin;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!BASE || !canManage)("M3: reminder engine", () => {
  it("alerts once on an expiring document, then stops repeating (dedupe)", async () => {
    const head = await session.head();
    const hr = await session.hr();
    const owner = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const client = (await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id;
    await api(head, `/clients/${client}/assignments`, "POST", { userId: owner.id, role: "OWNER", effectiveFrom: day(-30) });
    const employee = (await api(hr, "/employees", "POST", { nameEn: `E2E ${uniq()}`, classification: "SPONSORED", clientId: client, effectiveFrom: day(-10) })).data.id;
    const doc = (await api(hr, `/documents?ownerType=EMPLOYEE&ownerId=${employee}`, "POST", { type: "IQAMA", expiryDate: day(20) })).data.id;

    const a = await admin();
    expect((await api(a, "/reminders/run", "POST", {})).status).toBe(200);
    const first = await db.notification.findMany({ where: { entityId: doc } });
    expect(first.map((n) => n.userId)).toContain(owner.id); // the account owner hears about it
    expect(first.length).toBeGreaterThan(0);

    await api(a, "/reminders/run", "POST", {});
    expect(await db.notification.count({ where: { entityId: doc } })).toBe(first.length);

    // In the owner's inbox, in their language.
    const am = await session.am1();
    const recent = await api(am, "/notifications/recent");
    expect(recent.data.unread).toBeGreaterThan(0);

    // Archiving the document closes its reminders.
    await api(hr, `/documents/${doc}`, "DELETE");
    await api(a, "/reminders/run", "POST", {});
    expect(await db.notification.count({ where: { entityId: doc, status: { in: ["UNREAD", "READ"] } } })).toBe(0);
  });

  it("escalates to the department head when nobody acknowledges in time", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const head = await db.user.findUniqueOrThrow({ where: { email: "head@entitygate.test" } });
    const rule = await db.reminderRule.findFirstOrThrow({ where: { trigger: "DOC_EXPIRY" } });
    const old = await db.notification.create({
      data: { userId: user.id, ruleId: rule.id, entityType: "test", entityId: `e2e-${uniq()}`, title: "notif.docExpired", body: "{}", dedupeKey: `e2e:${uniq()}`, createdAt: new Date(Date.now() - 1000 * 3_600_000) },
    });
    await api(await admin(), "/reminders/run", "POST", {});
    expect((await db.notification.findUniqueOrThrow({ where: { id: old.id } })).escalatedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: head.id, dedupeKey: { startsWith: `esc:${old.id}` } } })).toBe(1);
  });

  it("only the owner can act on a notification; snooze hides and returns it", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: "am1@entitygate.test" } });
    const n = await db.notification.create({ data: { userId: user.id, entityType: "test", entityId: `e2e-${uniq()}`, title: "notif.docExpired", dedupeKey: `e2e:${uniq()}` } });
    expect((await api(await session.am2(), `/notifications/${n.id}`, "POST", { action: "ack" })).status).toBe(404);
    const am = await session.am1();
    expect((await api(am, `/notifications/${n.id}`, "POST", { action: "snooze", hours: 1 })).status).toBe(200);
    await db.notification.update({ where: { id: n.id }, data: { snoozedUntil: new Date(Date.now() - 1000) } });
    await api(await admin(), "/reminders/run", "POST", {});
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("UNREAD");
    expect((await api(am, `/notifications/${n.id}`, "POST", { action: "ack" })).status).toBe(200);
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("ACKED");
  });

  it("rejects bad rule offsets and blocks non-admins from rules", async () => {
    const rule = await db.reminderRule.findFirstOrThrow();
    expect((await api(await admin(), `/reminders/rules/${rule.id}`, "PUT", { offsets: "soon" })).status).toBe(422);
    expect((await api(await session.am1(), "/reminders/run", "POST", {})).status).toBe(403);
  });
});
