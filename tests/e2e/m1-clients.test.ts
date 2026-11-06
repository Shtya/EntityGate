import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { api, BASE, session, uniq } from "./helpers";

const db = new PrismaClient();
afterAll(() => db.$disconnect());
const userId = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;

describe.skipIf(!BASE)("M1: clients and contracts", () => {
  it("runs the new-account workflow and enforces its gates (WF-01)", async () => {
    const head = await session.head();
    const created = await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E Co LLC" });
    expect(created.status).toBe(201);
    const id = created.data.id;

    // Can't skip stages, or activate without an owner and a contract.
    expect((await api(head, `/clients/${id}/status`, "POST", { status: "ACTIVE" })).status).toBe(422);
    expect((await api(head, `/clients/${id}/status`, "POST", { status: "ONBOARDING" })).status).toBe(200);
    const noOwner = await api(head, `/clients/${id}/status`, "POST", { status: "ACTIVE" });
    expect(noOwner.status).toBe(422);

    const am = await userId("am1@entitygate.test");
    expect((await api(head, `/clients/${id}/assignments`, "POST", { userId: am, role: "OWNER", effectiveFrom: "2026-01-01" })).status).toBe(201);
    expect((await api(head, `/clients/${id}/status`, "POST", { status: "ACTIVE" })).status).toBe(422); // still no contract

    const noFee = await api(head, `/clients/${id}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15" });
    expect(noFee.status).toBe(422);
    expect(noFee.error.details[0].path).toBe("feePercent");

    const contract = await api(head, `/clients/${id}/contracts`, "POST", { number: `C-${uniq()}`, startDate: "2026-01-01", billingModel: "COST_PLUS_PERCENT", paymentTermsDays: 30, renewalNoticeDays: 60, vatPercent: "15", feePercent: "8" });
    expect(contract.status).toBe(201);
    expect((await api(head, `/clients/${id}/status`, "POST", { status: "ACTIVE" })).status).toBe(200);

    // 8 is stored as the fraction 0.08.
    const stored = await db.rateCard.findFirstOrThrow({ where: { contractId: contract.data.id } });
    expect(stored.feePercent!.toString()).toBe("0.08");

    // A new rate closes the old one, keeping history.
    const rate = await api(head, `/contracts/${contract.data.id}/rate-cards`, "POST", { effectiveFrom: "2026-06-01", feePercent: "10" });
    expect(rate.status).toBe(201);
    const cards = await db.rateCard.findMany({ where: { contractId: contract.data.id }, orderBy: { effectiveFrom: "asc" } });
    expect(cards).toHaveLength(2);
    expect(cards[0].effectiveTo!.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(cards[1].effectiveTo).toBeNull();
  });

  it("changing owner closes the previous owner and keeps history (ACC-05)", async () => {
    const head = await session.head();
    const { data } = await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "E2E Co" });
    const [a, b] = [await userId("am1@entitygate.test"), await userId("am2@entitygate.test")];
    await api(head, `/clients/${data.id}/assignments`, "POST", { userId: a, role: "OWNER", effectiveFrom: "2026-01-01" });
    await api(head, `/clients/${data.id}/assignments`, "POST", { userId: b, role: "OWNER", effectiveFrom: "2026-03-01" });
    const rows = await db.accountAssignment.findMany({ where: { clientId: data.id, role: "OWNER" }, orderBy: { effectiveFrom: "asc" } });
    expect(rows.map((r) => r.userId)).toEqual([a, b]);
    expect(rows[0].effectiveTo!.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("an account manager is denied a client they aren't assigned to (UAT-01)", async () => {
    const head = await session.head();
    const { data } = await api(head, "/clients", "POST", { displayName: `E2E ${uniq()}`, legalName: "Client B" });
    const am = await session.am2();
    expect((await api(am, `/clients/${data.id}`)).status).toBe(403);
    expect((await api(am, `/clients/${data.id}`, "PUT", { displayName: "Hacked", legalName: "Hacked" })).status).toBe(403);
    const list = await api(am, "/clients?q=" + encodeURIComponent("Client B"));
    expect(list.data.rows.every((r: { id: string }) => r.id !== data.id)).toBe(true);

    // Once assigned, they can read it.
    await api(head, `/clients/${data.id}/assignments`, "POST", { userId: await userId("am2@entitygate.test"), role: "SUPPORT", effectiveFrom: "2026-01-01" });
    expect((await api(am, `/clients/${data.id}`)).status).toBe(200);
  });

  it("read-only roles can't change clients", async () => {
    const exec = await session.exec();
    expect((await api(exec, "/clients", "POST", { displayName: "x", legalName: "y" })).status).toBe(403);
  });

  it("validates input", async () => {
    const head = await session.head();
    const res = await api(head, "/clients", "POST", { displayName: "" });
    expect(res.status).toBe(422);
    expect(res.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["displayName", "legalName"]);
  });
});
