/** Shared input rules. Messages are keys in messages/*.json. No "server-only": forms may reuse these. */
import { z } from "zod";

export const reqText = (max = 200) => z.string({ error: "validation.required" }).trim().min(1, "validation.required").max(max, "validation.tooLong");
export const optText = (max = 500) => z.string().trim().max(max, "validation.tooLong").nullish();
export const reqId = z.string({ error: "validation.required" }).min(1, "validation.required").max(50);
export const optId = z.string().max(50).nullish();
export const optEmail = z.email("validation.emailInvalid").nullish();

const isDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
export const reqDate = z.string({ error: "validation.required" }).refine(isDate, "validation.date");
export const optDate = z.string().refine(isDate, "validation.date").nullish();

/** Money stays a string all the way to Decimal: never a float. Up to 2 decimals. */
export const reqMoney = z.string({ error: "validation.required" }).trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "validation.money");
export const optMoney = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "validation.money").nullish();
/** A percentage typed as 8 or 8.5, stored as a fraction by the service. */
export const optPercent = z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/, "validation.percent").nullish();
export const reqInt = z.coerce.number({ error: "validation.required" }).int("validation.number").min(0, "validation.number").max(100000, "validation.number");
export const period = z.string({ error: "validation.required" }).regex(/^\d{4}-(0[1-9]|1[0-2])$/, "validation.period");

export const pageQuery = {
  page: z.coerce.number().int().min(1).catch(1).default(1),
  q: z.string().trim().max(100).optional(),
};
export const PAGE_SIZE = 25;
