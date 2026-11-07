import { z } from "zod";
import { optDate, optId, optMoney, optText, pageQuery, period, reqDate, reqId, reqMoney, reqText } from "@/server/validation";

export const INVOICE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "ISSUED", "PARTIALLY_PAID", "PAID", "DISPUTED", "VOID"] as const;
export const PAYMENT_METHODS = ["bank_transfer", "cheque", "other"] as const;

export const runSchema = z.object({ period });

export const invoiceSchema = z.object({
  clientId: reqId,
  type: z.enum(["ONE_OFF", "SPONSORSHIP_RENEWAL"], { error: "validation.required" }),
  serviceId: optId,
  description: optText(300),
  amount: optMoney,
  quantity: z.coerce.number().int().min(1).max(10000).nullish(),
  poNumber: optText(60),
  notes: optText(1000),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const lineSchema = z.object({ description: reqText(300), amount: reqMoney });
export const poSchema = z.object({ poNumber: optText(60), notes: optText(1000) });
export const creditSchema = z.object({ amount: reqMoney, reason: reqText(500) });
export const disputeSchema = z.object({ disputed: z.boolean() });

export const paymentSchema = z.object({
  clientId: reqId,
  receivedAt: reqDate,
  amount: reqMoney,
  method: z.enum(PAYMENT_METHODS, { error: "validation.required" }),
  reference: optText(100),
  proofAttachmentId: optId,
  invoiceId: optId,
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const listInvoicesQuery = z.object({
  ...pageQuery,
  status: z.enum(INVOICE_STATUSES).optional().catch(undefined),
  client: z.string().max(50).optional(),
  view: z.enum(["open", "overdue", "all"]).catch("open").default("open"),
  from: optDate.optional().catch(undefined),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>;

export const listPaymentsQuery = z.object({ ...pageQuery, client: z.string().max(50).optional() });
