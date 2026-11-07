/** Task categories as managed cards, tasks built from them, on-hold reasons, the finance step and private tasks. */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { api, BASE, canManage, session, uniq } from "./helpers";

vi.setConfig({ testTimeout: 180_000 });
const db = new PrismaClient();
const made: string[] = [];
afterAll(async () => {
  await db.task.deleteMany({ where: { categories: { some: { categoryId: { in: made } } } } });
  await db.taskCategory.deleteMany({ where: { id: { in: made } } });
  await db.$disconnect();
});

const userId = (email: string) => db.user.findUniqueOrThrow({ where: { email } }).then((u) => u.id);

describe.skipIf(!BASE || !canManage)("task categories and the task flow", () => {
  it("manages categories: add, rename, no duplicates, archive when used, delete when not", async () => {
    const head = await session.head();
    const am = await session.am1();
    const name = `E2E فئة ${uniq()}`;
    expect((await api(am, "/task-categories", "POST", { name: "x" })).status).toBe(403);
    const a = await api(head, "/task-categories", "POST", { name });
    expect(a.status).toBe(201);
    made.push(a.data.id);
    expect((await api(head, "/task-categories", "POST", { name })).status).toBe(422);
    expect((await api(head, `/task-categories/${a.data.id}`, "PUT", { name: `${name} 2` })).status).toBe(200);

    const unused = await api(head, "/task-categories", "POST", { name: `E2E ${uniq()}` });
    made.push(unused.data.id);
    const del = await api(head, `/task-categories/${unused.data.id}`, "DELETE");
    expect([del.status, del.data.archived]).toEqual([200, false]);
    expect(await db.taskCategory.findUnique({ where: { id: unused.data.id } })).toBeNull();

    const owner = await userId("am1@entitygate.test");
    const task = await api(head, "/tasks", "POST", { title: "E2E", categoryIds: [a.data.id], ownerId: owner, priority: "MEDIUM" });
    expect(task.status).toBe(201);
    const archived = await api(head, `/task-categories/${a.data.id}`, "DELETE");
    expect([archived.data.archived, archived.data.tasks]).toEqual([true, 1]);
    // The task keeps its category; new tasks can't use it.
    expect(await db.taskCategoryLink.count({ where: { categoryId: a.data.id } })).toBe(1);
    expect((await api(head, "/tasks", "POST", { title: "E2E", categoryIds: [a.data.id], ownerId: owner, priority: "MEDIUM" })).status).toBe(422);
    expect((await api(head, `/task-categories/${a.data.id}/restore`, "POST")).status).toBe(200);
  });

  it("creates a full task, puts it on hold with a reason, and routes payment through Finance", async () => {
    const head = await session.head();
    const finance = await session.finance();
    const cat = await api(head, "/task-categories", "POST", { name: `E2E ${uniq()}` });
    made.push(cat.data.id);
    const [owner, hr, am] = await Promise.all(["am1", "hr", "am2"].map((u) => userId(`${u}@entitygate.test`)));
    const res = await api(head, "/tasks", "POST", {
      type: "CLIENT", title: "E2E renewal - Ismail 2051125022", categoryIds: [cat.data.id], ownerId: owner, hrRepId: hr, accountManagerId: am,
      clientEmail: "client@example.com", priority: "HIGH", status: "TODO", financeRequired: true,
    });
    expect(res.status).toBe(201);
    const id = res.data.id;
    const row = await db.task.findUniqueOrThrow({ where: { id }, include: { categories: true } });
    expect([row.hrRepId, row.accountManagerId, row.clientEmail, row.financeRequired, row.categories.length]).toEqual([hr, am, "client@example.com", true, 1]);

    expect((await api(head, `/tasks/${id}/status`, "POST", { status: "BLOCKED" })).status).toBe(422); // reason required
    expect((await api(head, `/tasks/${id}/status`, "POST", { status: "BLOCKED", reason: "Per management" })).status).toBe(200);
    expect((await db.task.findUniqueOrThrow({ where: { id } })).holdReason).toBe("Per management");

    // Done → waiting finance, until Finance confirms.
    expect((await api(head, `/tasks/${id}/status`, "POST", { status: "DONE" })).data.status).toBe("WAITING_FINANCE");
    expect((await db.task.findUniqueOrThrow({ where: { id } })).holdReason).toBeNull();
    expect((await api(head, `/tasks/${id}/finance`, "POST")).status).toBe(403);
    expect((await api(finance, `/tasks/${id}/finance`, "POST")).status).toBe(200);
    const done = await db.task.findUniqueOrThrow({ where: { id } });
    expect([done.status, done.financeClearedAt !== null]).toEqual(["DONE", true]);

    // Internal tasks drop the account manager; editing replaces categories.
    const edit = await api(head, `/tasks/${id}`, "PUT", { type: "INTERNAL", title: "E2E edited", categoryIds: [], ownerId: owner, accountManagerId: am, priority: "LOW" });
    expect(edit.status).toBe(200);
    const edited = await db.task.findUniqueOrThrow({ where: { id }, include: { categories: true } });
    expect([edited.title, edited.accountManagerId, edited.categories.length]).toEqual(["E2E edited", null, 0]);
  });

  it("keeps an only-me task private, except from administrators", async () => {
    const am = await session.am1();
    const cat = await api(await session.head(), "/task-categories", "POST", { name: `E2E ${uniq()}` });
    made.push(cat.data.id);
    const res = await api(am, "/tasks", "POST", { title: "E2E private", onlyMe: true, categoryIds: [cat.data.id], priority: "MEDIUM" });
    expect(res.status).toBe(201);
    const row = await db.task.findUniqueOrThrow({ where: { id: res.data.id } });
    expect([row.onlyMe, row.ownerId]).toEqual([true, await userId("am1@entitygate.test")]);
    // The department head sees every queue, but not this.
    const head = await session.head();
    expect((await api(head, `/tasks/${res.data.id}`)).status).toBe(404);
    const all = await api(head, `/tasks?view=all&category=${cat.data.id}`);
    expect(all.data.rows).toHaveLength(0);
    expect((await api(await session.admin(), `/tasks/${res.data.id}`)).status).toBe(200);
    expect((await api(am, `/tasks?view=onlyMe&category=${cat.data.id}`)).data.rows).toHaveLength(1);
  });
});
