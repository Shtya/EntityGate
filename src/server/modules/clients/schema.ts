import { z } from "zod";
import { optDate, optEmail, optMoney, optPercent, optText, pageQuery, reqDate, reqId, reqInt, reqText } from "@/server/validation";

export const CLIENT_STATUSES = ["PROSPECT", "ONBOARDING", "ACTIVE", "SUSPENDED", "EXITED"] as const;
export const BILLING_MODELS = ["COST_PLUS_PERCENT", "FIXED_PER_HEAD", "COST_PLUS_FIXED"] as const;
export const CONTRACT_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"] as const;

export const clientSchema = z.object({
  displayName: reqText(120),
  legalName: reqText(200),
  crNumber: optText(40),
  vatNumber: optText(40),
  parentCompany: optText(200),
  country: optText(80),
  industry: optText(80),
  notes: optText(2000),
});
export type ClientInput = z.infer<typeof clientSchema>;

export const clientStatusSchema = z.object({ status: z.enum(CLIENT_STATUSES) });

export const assignSchema = z.object({
  userId: reqId,
  role: z.enum(["OWNER", "SUPPORT"], { error: "validation.required" }),
  effectiveFrom: reqDate,
});

export const contactSchema = z.object({
  name: reqText(120),
  role: optText(80),
  email: optEmail,
  phone: optText(32),
  isBillingContact: z.boolean().nullish(),
});

const pricing = {
  feePercent: optPercent,
  feePerHead: optMoney,
  feeFixedMonthly: optMoney,
  sponsorshipRenewalFee: optMoney,
};

export const contractSchema = z.object({
  number: reqText(40),
  startDate: reqDate,
  endDate: optDate,
  billingModel: z.enum(BILLING_MODELS, { error: "validation.required" }),
  paymentTermsDays: reqInt,
  renewalNoticeDays: reqInt,
  vatPercent: z.string({ error: "validation.required" }).regex(/^\d{1,3}(\.\d{1,4})?$/, "validation.percent"),
  ...pricing,
});
export type ContractInput = z.infer<typeof contractSchema>;

export const rateCardSchema = z.object({ effectiveFrom: reqDate, ...pricing });
export type RateCardInput = z.infer<typeof rateCardSchema>;

export const contractStatusSchema = z.object({ status: z.enum(CONTRACT_STATUSES) });

export const listClientsQuery = z.object({ ...pageQuery, status: z.enum(CLIENT_STATUSES).optional().catch(undefined), owner: z.string().max(50).optional() });
export type ListClientsQuery = z.infer<typeof listClientsQuery>;
