import { PRIORITIES, RECURRENCES } from "@/server/modules/operations/schema";
import type { FieldSpec } from "@/components/patterns/form-dialog";
import type { Option } from "@/components/ui/select";

type T = (key: string) => string;

export const PRIORITY_TONE = { URGENT: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" } as const;
export const TASK_TONE = { TODO: "neutral", IN_PROGRESS: "info", BLOCKED: "warning", DONE: "success", CANCELLED: "neutral" } as const;

export const taskFields = (t: T, users: Option[], clients: Option[]): FieldSpec[] => [
  { name: "title", label: t("tasks.taskTitle"), required: true, wide: true },
  { name: "ownerId", label: t("tasks.owner"), type: "select", required: true, options: users },
  { name: "clientId", label: t("employees.client"), type: "select", options: clients, hint: t("tasks.clientHint") },
  { name: "dueAt", label: t("tasks.due"), type: "date" },
  { name: "priority", label: t("tasks.priority"), type: "select", required: true, options: PRIORITIES.map((p) => ({ value: p, label: t(`enums.Priority.${p}`) })) },
  { name: "recurrence", label: t("tasks.repeat"), type: "select", options: RECURRENCES.map((r) => ({ value: r, label: t(`enums.Recurrence.${r}`) })) },
  { name: "description", label: t("tasks.details"), type: "textarea" },
];
