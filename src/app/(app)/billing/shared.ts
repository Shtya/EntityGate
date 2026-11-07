import { PAYMENT_METHODS } from "@/server/modules/billing/schema";
import type { FieldSpec } from "@/components/patterns/form-dialog";
import type { Option } from "@/components/ui/select";

type T = (key: string) => string;

export const INVOICE_TONE = { DRAFT: "neutral", PENDING_APPROVAL: "info", ISSUED: "primary", PARTIALLY_PAID: "accent", PAID: "success", DISPUTED: "warning", VOID: "neutral" } as const;
export const RUN_TONE = { DRAFT: "neutral", APPROVED: "info", ISSUED: "success", CANCELLED: "neutral" } as const;

export const invoiceFields = (t: T, clients: Option[], services: Option[] = []): FieldSpec[] => [
  { name: "clientId", label: t("employees.client"), type: "select", required: true, options: clients },
  { name: "type", label: t("billing.invoiceType"), type: "select", required: true, options: (["ONE_OFF", "SPONSORSHIP_RENEWAL"] as const).map((k) => ({ value: k, label: t(`enums.InvoiceType.${k}`) })) },
  ...(services.length ? [{ name: "serviceId", label: t("billing.service"), type: "select", wide: true, options: services, hint: t("billing.serviceHint") } satisfies FieldSpec] : []),
  { name: "description", label: t("billing.lineDescription"), wide: true },
  { name: "amount", label: t("billing.unitAmount"), type: "money", hint: t("billing.unitAmountHint") },
  { name: "quantity", label: t("billing.quantity"), type: "number" },
  { name: "poNumber", label: t("billing.po"), ltr: true },
  { name: "notes", label: t("common.notes"), type: "textarea" },
];

export const paymentFields = (t: T, clients: Option[], fixedClient?: string): FieldSpec[] => [
  ...(fixedClient ? [] : [{ name: "clientId", label: t("employees.client"), type: "select", required: true, options: clients } satisfies FieldSpec]),
  { name: "amount", label: t("billing.amountReceived"), type: "money", required: true },
  { name: "receivedAt", label: t("billing.receivedOn"), type: "date", required: true },
  { name: "method", label: t("billing.method"), type: "select", required: true, options: PAYMENT_METHODS.map((m) => ({ value: m, label: t(`enums.PaymentMethod.${m}`) })) },
  { name: "reference", label: t("billing.reference"), ltr: true },
  { name: "proofAttachmentId", label: t("billing.proof"), type: "file", wide: true },
];
