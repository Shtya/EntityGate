import type { Actor } from "@/server/rbac/policy";
import { can } from "@/server/rbac/policy";
import type { FieldSpec } from "@/components/patterns/form-dialog";
import { PageTabs } from "@/components/patterns/record";
import type { Option } from "@/components/ui/select";

type T = { (key: string): string; has(key: string): boolean };

export const EXPENSE_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "neutral" } as const;
export const PAYABLE_TONE = { OPEN: "warning", PAID: "success", CANCELLED: "neutral" } as const;

export function FinanceTabs({ actor, active, t }: { actor: Actor; active: string; t: T }) {
  const tabs = [
    { key: "pnl", label: t("finance.pnl"), href: "/finance/pnl", show: can(actor, "finance:read") },
    { key: "expenses", label: t("finance.expenses"), href: "/finance/expenses", show: can(actor, "expense:read") },
    { key: "payroll", label: t("finance.payroll"), href: "/finance/payroll", show: can(actor, "payroll:read") },
    { key: "payables", label: t("finance.payables"), href: "/finance/payables", show: can(actor, "payable:read") },
    { key: "periods", label: t("finance.periods"), href: "/finance/periods", show: can(actor, "period:close") },
  ].filter((x) => x.show);
  return <PageTabs active={active} tabs={tabs} />;
}

export const expenseFields = (t: T, categories: { id: string; code: string; name: string; kind: string }[], clients: Option[], employees: Option[], fromCase = false): FieldSpec[] => [
  { name: "categoryId", label: t("finance.category"), type: "select", required: true, wide: true, options: categories.filter((c) => !fromCase || c.kind === "DIRECT").map((c) => ({ value: c.id, label: t.has(`enums.ExpenseCategory.${c.code}`) ? t(`enums.ExpenseCategory.${c.code}`) : c.name })) },
  { name: "description", label: t("billing.lineDescription"), required: true, wide: true },
  { name: "amount", label: t("finance.amountExVat"), type: "money", required: true },
  { name: "vat", label: t("billing.vat"), type: "money" },
  { name: "incurredAt", label: t("finance.incurredAt"), type: "date", required: true },
  { name: "vendor", label: t("finance.vendor") },
  ...(fromCase
    ? []
    : ([
        { name: "clientId", label: t("employees.client"), type: "select", options: clients, hint: t("finance.clientHint") },
        { name: "employeeId", label: t("finance.employee"), type: "select", options: employees },
      ] satisfies FieldSpec[])),
  { name: "recoverable", label: t("finance.recoverable"), type: "checkbox", hint: t("finance.recoverableHint") },
  { name: "attachmentId", label: t("finance.receipt"), type: "file", wide: true },
];
