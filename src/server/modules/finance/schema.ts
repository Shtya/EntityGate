import { z } from "zod";
import { optId, optMoney, optText, pageQuery, period, reqDate, reqId, reqMoney, reqText } from "@/server/validation";

export const PAYABLE_TYPES = ["SALARY", "GOSI", "INSURANCE", "GOV_FEE", "OTHER"] as const;
export const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const expenseSchema = z.object({
  categoryId: reqId,
  clientId: optId,
  employeeId: optId,
  caseId: optId,
  description: reqText(300),
  amount: reqMoney,
  vat: optMoney,
  incurredAt: reqDate,
  vendor: optText(120),
  recoverable: z.boolean().nullish(),
  attachmentId: optId,
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const listExpensesQuery = z.object({
  ...pageQuery,
  status: z.enum(EXPENSE_STATUSES).optional().catch(undefined),
  kind: z.enum(["DIRECT", "OVERHEAD"]).optional().catch(undefined),
  client: z.string().max(50).optional(),
  month: period.optional().catch(undefined),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuery>;

export const decisionSchema = z.object({ approved: z.boolean() });
export const periodBody = z.object({ period });
export const pnlQuery = z.object({
  from: period.optional().catch(undefined),
  to: period.optional().catch(undefined),
  view: z.enum(["clients", "managers", "months"]).catch("clients").default("clients"),
});
export const payrollItemsQuery = z.object({ ...pageQuery, client: z.string().max(50).optional() });

export const payableSchema = z.object({
  type: z.enum(PAYABLE_TYPES, { error: "validation.required" }),
  description: reqText(300),
  dueDate: reqDate,
  amount: reqMoney,
  reference: optText(100),
});
export type PayableInput = z.infer<typeof payableSchema>;
export const payableStatusSchema = z.object({ status: z.enum(["PAID", "CANCELLED", "OPEN"]), reference: optText(100) });
export const listPayablesQuery = z.object({ ...pageQuery, status: z.enum(["OPEN", "PAID", "CANCELLED"]).catch("OPEN").default("OPEN") });
