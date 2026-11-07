import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

// Each reminder run scans the whole database, several times per test.
vi.setConfig({ testTimeout: 180_000 });
const db = new PrismaClient();
afterAll(() => db.$disconnect());
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email } });
const category = () => db.caseCategory.findFirstOrThrow({ where: { code: "EXIT_REENTRY" } });

async function client(cookie: string) {
  return (await api(cookie, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E" })).data.id as string;
}

describe.skipIf(!BASE)("M4: tasks", () => {
  it("the owner sees it in their queue, and is told (TSK-03/04)", async () => {
    const head = await session.head();
    const owner = await user("ops@entitygate.test");
    const made = await api(head, "/tasks", "POST", { title: `E2E ${uniq()}`, ownerId: owner.id, priority: "HIGH", dueAt: "2020-01-01" });
    expect(made.status).toBe(201);
    const ops = await session.ops();
    const queue = await api(ops, "/tasks?view=mine");
    expect(queue.data.rows.some((r: { id: string }) => r.id === made.data.id)).toBe(true);
    expect(await db.notification.count({ where: { userId: owner.id, entityId: made.data.id } })).toBe(1);
    const overdue = await api(ops, "/tasks?view=overdue");
    expect(overdue.data.rows.some((r: { id: string }) => r.id === made.data.id)).toBe(true);
  });

  it("completing a monthly task schedules next month's", async () => {
    const head = await session.head();
    const owner = await user("head@entitygate.test");
    const title = `E2E monthly ${uniq()}`;
    const { data } = await api(head, "/tasks", "POST", { title, ownerId: owner.id, priority: "MEDIUM", dueAt: "2026-09-30", recurrence: "MONTHLY" });
    await api(head, `/tasks/${data.id}/status`, "POST", { status: "DONE" });
    const rows = await db.task.findMany({ where: { title }, orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("TODO");
    expect(rows[1].dueAt!.toISOString().slice(0, 10)).toBe("2026-10-30");
  });

  it("someone unrelated can't open a task", async () => {
    const head = await session.head();
    const owner = await user("head@entitygate.test");
    const { data } = await api(head, "/tasks", "POST", { title: `E2E ${uniq()}`, ownerId: owner.id, priority: "LOW" });
    expect((await api(await session.am2(), `/tasks/${data.id}`)).status).toBe(403);
  });

  it("team view needs task:read_all, and falls back to your own", async () => {
    const am = await session.am1();
    expect((await api(am, "/tasks?view=team")).data.view).toBe("mine");
  });
});

describe.skipIf(!BASE)("M4: cases", () => {
  async function newCase() {
    const head = await session.head();
    const owner = await user("head@entitygate.test");
    const clientId = await client(head);
    const made = await api(head, "/cases", "POST", { title: `E2E ${uniq()}`, categoryId: (await category()).id, clientId, ownerId: owner.id });
    expect(made.status).toBe(201);
    return { head, id: made.data.id as string, clientId, owner };
  }

  it("must be linked to a client or an employee (CAS-01)", async () => {
    const head = await session.head();
    const res = await api(head, "/cases", "POST", { title: "x", categoryId: (await category()).id, ownerId: (await user("head@entitygate.test")).id });
    expect(res.status).toBe(422);
    expect(res.error.details[0].path).toBe("clientId");
  });

  it("every status change stays in history (UAT-03, BR-04)", async () => {
    const { head, id } = await newCase();
    await api(head, `/cases/${id}/stage`, "POST", { stage: "UNDER_REVIEW" });
    await api(head, `/cases/${id}/stage`, "POST", { stage: "EXECUTION", note: "working" });
    const before = await db.case.findUniqueOrThrow({ where: { id } });
    expect(before.firstResponseAt).not.toBeNull();
    expect(before.slaDueAt).not.toBeNull();

    // Plain moves can't close or reopen.
    expect((await api(head, `/cases/${id}/stage`, "POST", { stage: "CLOSED" })).status).toBe(422);
    // Closing needs a note.
    expect((await api(head, `/cases/${id}/close`, "POST", {})).status).toBe(422);
    expect((await api(head, `/cases/${id}/close`, "POST", { resolutionNote: "Issued" })).status).toBe(200);
    expect((await api(head, `/cases/${id}/stage`, "POST", { stage: "EXECUTION" })).status).toBe(422);

    // Reopening needs a reason, and history survives.
    expect((await api(head, `/cases/${id}/reopen`, "POST", {})).status).toBe(422);
    expect((await api(head, `/cases/${id}/reopen`, "POST", { reason: "Wrong dates" })).status).toBe(200);
    const events = await db.caseEvent.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStage)).toEqual(["RECEIVED", "UNDER_REVIEW", "EXECUTION", "CLOSED", "REOPENED"]);
    expect(events[4].note).toBe("Wrong dates");
  });

  it("closing is restricted to authorized roles (CAS-05)", async () => {
    const { id } = await newCase();
    const ops = await session.ops(); // Operations Supervisor has no case:close
    expect((await api(ops, `/cases/${id}/close`, "POST", { resolutionNote: "x" })).status).toBe(403);
  });

  it("an overdue case lands in the escalation queue by itself (UAT-04)", async () => {
    if (!canManage) return;
    const { head, id } = await newCase();
    await db.case.update({ where: { id }, data: { slaDueAt: new Date(Date.now() - 3_600_000), severity: "CRITICAL" } });
    expect((await api(await session.admin(), "/reminders/run", "POST", {})).status).toBe(200);
    expect((await db.case.findUniqueOrThrow({ where: { id } })).breached).toBe(true);
    const queue = await api(head, "/escalations");
    const row = queue.data.find((e: { caseId: string }) => e.caseId === id);
    expect(row.severity).toBe("CRITICAL");
    expect(row.raisedById).toBeNull();
    // Running again doesn't pile on a second escalation.
    await api(await session.admin(), "/reminders/run", "POST", {});
    expect(await db.escalation.count({ where: { caseId: id } })).toBe(1);
    // Closing the case resolves it.
    await api(head, `/cases/${id}/close`, "POST", { resolutionNote: "Done" });
    expect((await db.escalation.findFirstOrThrow({ where: { caseId: id } })).status).toBe("RESOLVED");
  });

  it("an account manager is denied cases on other clients", async () => {
    const { id } = await newCase();
    expect((await api(await session.am2(), `/cases/${id}`)).status).toBe(403);
  });
});

describe.skipIf(!BASE)("M4: escalations", () => {
  it("raises, updates with an SLA clock, and resolves", async () => {
    const head = await session.head();
    const owner = await user("head@entitygate.test");
    const made = await api(head, "/escalations", "POST", { title: `E2E ${uniq()}`, severity: "CRITICAL", ownerId: owner.id, impactAmount: "108226.00" });
    expect(made.status).toBe(201);
    const row = await db.escalation.findUniqueOrThrow({ where: { id: made.data.id } });
    // Critical: an update within 4 calendar hours.
    const hours = (row.nextUpdateDueAt!.getTime() - row.raisedAt.getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(4);
    expect(row.impactAmount!.toString()).toBe("108226");
    expect((await api(head, `/escalations/${row.id}/update`, "POST", { note: "Client called" })).status).toBe(200);
    expect((await db.escalation.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACKNOWLEDGED");
    expect((await api(head, `/escalations/${row.id}/resolve`, "POST", { note: "Paid" })).status).toBe(200);
    expect((await api(head, `/escalations/${row.id}/update`, "POST", { note: "late" })).status).toBe(422);
  });

  it("read-only roles can see but not raise", async () => {
    const exec = await session.exec();
    expect((await api(exec, "/escalations")).status).toBe(200);
    expect((await api(exec, "/escalations", "POST", { title: "x", severity: "LOW", ownerId: "x" })).status).toBe(403);
  });
});
