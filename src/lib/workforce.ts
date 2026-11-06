/** Pure workforce rules, shared by pages, the reminder engine and tests. */

export type DocStatus = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

/** Calendar days until expiry (negative once past). */
export function daysUntil(expiry: Date, today: Date): number {
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

export function documentStatus(expiry: Date | null, today: Date, warnDays = 60): DocStatus {
  if (!expiry) return "NO_EXPIRY";
  const days = daysUntil(expiry, today);
  if (days < 0) return "EXPIRED";
  return days <= warnDays ? "EXPIRING" : "VALID";
}

/** Documents an employee must hold before they can legally work on our sponsorship. */
export const REQUIRED_DOCUMENTS: Record<string, string[]> = {
  SPONSORED: ["IQAMA", "PASSPORT", "EMPLOYMENT_CONTRACT", "INSURANCE"],
  NON_SPONSORED: ["EMPLOYMENT_CONTRACT"],
  GOSI: ["EMPLOYMENT_CONTRACT"],
};

export function missingDocuments(classification: string, heldTypes: string[]): string[] {
  return (REQUIRED_DOCUMENTS[classification] ?? []).filter((d) => !heldTypes.includes(d));
}

export const WORKFLOW_STEPS: Record<string, string[]> = {
  JOINER: ["CONTRACT", "DOCUMENTS", "SPONSORSHIP", "INSURANCE", "GOV_PLATFORMS", "ALLOCATION"],
  TRANSFER: ["CLIENT_APPROVAL", "SPONSORSHIP", "ALLOCATION"],
  RENEWAL: ["DOCUMENTS", "FEES", "GOV_PLATFORMS"],
  EXIT: ["NOTICE", "FINAL_SETTLEMENT", "GOV_PLATFORMS", "INSURANCE"],
};

/** BR-02: headcount by classification. Totals are derived from the same rows, so they always reconcile. */
export function headcountSummary(rows: { classification: string }[]) {
  const count = (c: string) => rows.filter((r) => r.classification === c).length;
  return { total: rows.length, SPONSORED: count("SPONSORED"), NON_SPONSORED: count("NON_SPONSORED"), GOSI: count("GOSI") };
}
