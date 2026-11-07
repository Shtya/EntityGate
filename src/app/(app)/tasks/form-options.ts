import "server-only";
import type { Actor } from "@/server/rbac/policy";
import { activeUserOptions, clientOptions } from "@/server/modules/clients/service";
import { employeeOptionsForExpense } from "@/server/modules/finance/service";
import { categoryChoices } from "@/server/modules/operations/categories";
import { PRIORITIES, RECURRENCES, START_STATUSES } from "@/server/modules/operations/schema";
import { todayDate, toDateOnly } from "@/lib/dates";
import type { TaskFormOptions } from "./task-form";

type T = (key: string) => string;

/** How far ahead a new task is due unless changed. The client's old system used the same gap. */
const DEFAULT_DUE_DAYS = 5;

export async function taskFormOptions(t: T, actor: Actor): Promise<TaskFormOptions> {
  const [categories, users, clients, employees] = await Promise.all([categoryChoices(), activeUserOptions(), clientOptions(), employeeOptionsForExpense()]);
  return {
    categories,
    users,
    clients,
    employees,
    priorities: PRIORITIES.map((p) => ({ value: p, label: t(`enums.Priority.${p}`) })),
    statuses: START_STATUSES.map((s) => ({ value: s, label: t(`enums.TaskStatus.${s}`) })),
    recurrences: RECURRENCES.map((r) => ({ value: r, label: t(`enums.Recurrence.${r}`) })),
    meId: actor.id,
    defaultDue: toDateOnly(new Date(todayDate().getTime() + DEFAULT_DUE_DAYS * 86_400_000)),
  };
}
