import { getLocale, getTranslations } from "next-intl/server";
import { can, type Actor } from "@/server/rbac/policy";
import { listExpensesQuery } from "@/server/modules/finance/schema";
import { expenseCategories, listExpenses } from "@/server/modules/finance/service";
import { formatDate, toDateOnly, todayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { FormButton } from "@/components/patterns/form-dialog";
import { RecordTable } from "@/components/patterns/record";
import { Badge, Panel, PanelHeader } from "@/components/ui/misc";
import { EXPENSE_TONE, expenseFields } from "../../finance/shared";

/** Government fees logged against a case, linked to its employee and client. */
export async function CaseExpenses({ caseId, clientId, employeeId, actor }: { caseId: string; clientId: string | null; employeeId: string | null; actor: Actor }) {
  if (!can(actor, "expense:read")) return null;
  const t = await getTranslations();
  const locale = await getLocale();
  const [{ rows }, categories] = await Promise.all([listExpenses({ ...listExpensesQuery.parse({}), caseId }), can(actor, "expense:create") ? expenseCategories() : []]);
  return (
    <Panel>
      <PanelHeader
        title={t("finance.caseFees")}
        actions={can(actor, "expense:create") && <FormButton size="sm" variant="secondary" label={t("finance.addFee")} title={t("finance.addFee")} endpoint="/expenses" submitLabel={t("common.add")} successMessage={t("finance.expenseSaved")} initial={{ incurredAt: toDateOnly(todayDate()), recoverable: Boolean(clientId) }} hiddenValues={{ caseId, clientId, employeeId }} fields={expenseFields(t, categories, [], [], true)} wide />}
      />
      <RecordTable
        rows={rows}
        rowKey={(e) => e.id}
        emptyTitle={t("finance.noFees")}
        columns={[
          { header: t("billing.lineDescription"), cell: (e) => <span><span className="block">{e.description}</span><span className="block text-xs text-muted num">{formatDate(e.incurredAt, locale)}</span></span> },
          { header: t("billing.amount"), align: "end", nowrap: true, cell: (e) => formatMoney(e.amount.toString(), { locale }) },
          { header: t("common.status"), cell: (e) => <Badge tone={EXPENSE_TONE[e.status]} dot>{t(`enums.ExpenseStatus.${e.status}`)}</Badge> },
        ]}
      />
    </Panel>
  );
}
