import { describe, expect, it } from "vitest";
import { dueOffset } from "@/server/modules/notifications/engine";
import { clientHealth } from "@/lib/finance";
import { documentStatus, headcountSummary, missingDocuments } from "@/lib/workforce";
import { parseDateOnly as d } from "@/lib/dates";

const OFFSETS = [-7, -3, 0, 1, 7, 30];
const due = d("2026-09-30");

describe("which reminder is due", () => {
  it.each([
    ["2026-09-22", null], // 8 days before: nothing yet
    ["2026-09-23", -7],
    ["2026-09-25", -7], // between stages: still the last one reached
    ["2026-09-27", -3],
    ["2026-09-30", 0],
    ["2026-10-01", 1],
    ["2026-10-07", 7],
    ["2026-12-25", 30],
  ])("on %s the offset is %s", (today, expected) => {
    expect(dueOffset(OFFSETS, due, d(today))).toBe(expected);
  });
  it("downtime can't lose a reminder: a missed stage still fires when the job comes back", () => {
    expect(dueOffset(OFFSETS, due, d("2026-10-04"))).toBe(1);
  });
});

describe("client health", () => {
  const healthy = { maxOverdueDays: 0, breachedCases: 0, revenue: "100000", cost: "85000" };
  it("is strong with nothing wrong", () => expect(clientHealth(healthy)).toBe("STRONG"));
  it("anything late means watch", () => expect(clientHealth({ ...healthy, maxOverdueDays: 3 })).toBe("WATCH"));
  it("over 30 days late is at risk", () => {
    expect(clientHealth({ ...healthy, maxOverdueDays: 30 })).toBe("WATCH");
    expect(clientHealth({ ...healthy, maxOverdueDays: 31 })).toBe("AT_RISK");
  });
  it("a breached case means watch", () => expect(clientHealth({ ...healthy, breachedCases: 1 })).toBe("WATCH"));
  it("a thin margin means watch", () => expect(clientHealth({ ...healthy, cost: "96000" })).toBe("WATCH"));
  it("no revenue yet isn't a margin problem", () => expect(clientHealth({ ...healthy, revenue: "0", cost: "0" })).toBe("STRONG"));
});

describe("workforce rules", () => {
  const today = d("2026-09-10");
  it("classifies document expiry", () => {
    expect(documentStatus(null, today)).toBe("NO_EXPIRY");
    expect(documentStatus(d("2026-09-09"), today)).toBe("EXPIRED");
    expect(documentStatus(d("2026-09-10"), today)).toBe("EXPIRING");
    expect(documentStatus(d("2026-11-09"), today)).toBe("EXPIRING");
    expect(documentStatus(d("2026-11-10"), today)).toBe("VALID");
  });
  it("knows what each classification must hold", () => {
    expect(missingDocuments("SPONSORED", ["IQAMA", "PASSPORT"])).toEqual(["EMPLOYMENT_CONTRACT", "INSURANCE"]);
    expect(missingDocuments("GOSI", ["EMPLOYMENT_CONTRACT"])).toEqual([]);
  });
  it("classification totals always reconcile with headcount (BR-02)", () => {
    const s = headcountSummary([{ classification: "SPONSORED" }, { classification: "SPONSORED" }, { classification: "GOSI" }, { classification: "NON_SPONSORED" }]);
    expect(s.total).toBe(4);
    expect(s.SPONSORED + s.NON_SPONSORED + s.GOSI).toBe(s.total);
  });
});
