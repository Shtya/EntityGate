import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/policy";
import { Forbidden } from "@/components/patterns/forbidden";

/** Opens the first finance page this person may see. */
export default async function FinancePage() {
  const actor = await getActor();
  if (can(actor, "finance:read")) redirect("/finance/pnl");
  if (can(actor, "expense:read")) redirect("/finance/expenses");
  if (can(actor, "payroll:read")) redirect("/finance/payroll");
  if (can(actor, "payable:read")) redirect("/finance/payables");
  if (can(actor, "period:close")) redirect("/finance/periods");
  return <Forbidden />;
}
