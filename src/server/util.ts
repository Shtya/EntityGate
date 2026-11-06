import "server-only";
import { Prisma } from "@prisma/client";
import type { DbOrTx } from "@/server/db";
import { todayDate } from "@/lib/dates";
import { money, type MoneyInput } from "@/lib/money";

/** What a Prisma row looks like once it's crossed into a client component. */
export type Plain<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? string
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

export function plain<T>(value: T): Plain<T> {
  return JSON.parse(JSON.stringify(value)) as Plain<T>;
}

/** Rows whose half-open [effective_from, effective_to) range covers a day. */
export function activeOn(day: Date = todayDate()) {
  return { effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: day } }] };
}

/**
 * Next number in a gapless sequence. Runs inside the caller's transaction and holds the row lock
 * until commit, so a rolled-back invoice doesn't burn a number and two issuers can't collide.
 */
export async function nextNumber(tx: DbOrTx, key: string, year = 0): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "number_sequences" ("key", "year", "next_val") VALUES (${key}, ${year}, 2)
    ON CONFLICT ("key", "year") DO UPDATE SET "next_val" = "number_sequences"."next_val" + 1
    RETURNING "next_val" - 1 AS value`;
  return Number(rows[0].value);
}

export const pad = (n: number, width = 4) => String(n).padStart(width, "0");

export const percentToFraction = (v: MoneyInput | null | undefined) => (v === null || v === undefined || v === "" ? null : money(v).dividedBy(100).toString());
export const fractionToPercent = (v: MoneyInput | null | undefined) => (v === null || v === undefined ? "" : money(v).times(100).toString());

/** "2026-11-06" to a DATE value, leaving null/undefined alone. */
export function dateOrNull(v: string | null | undefined): Date | null {
  return v ? new Date(`${v}T00:00:00Z`) : null;
}
export function dateOnly(v: string): Date {
  return new Date(`${v}T00:00:00Z`);
}
