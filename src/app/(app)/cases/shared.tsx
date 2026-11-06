import { CASE_SOURCES, SEVERITIES } from "@/server/modules/operations/schema";
import type { FieldSpec } from "@/components/patterns/form-dialog";
import type { Option } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type T = { (key: string): string; has: (key: string) => boolean };

export const SEVERITY_TONE = { CRITICAL: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" } as const;
export const STAGE_TONE = { RECEIVED: "neutral", UNDER_REVIEW: "info", EXECUTION: "primary", PENDING_EXTERNAL: "warning", QC: "accent", CLIENT_UPDATE: "info", CLOSED: "success", REOPENED: "warning" } as const;
export const FLOW = ["RECEIVED", "UNDER_REVIEW", "EXECUTION", "QC", "CLIENT_UPDATE", "CLOSED"] as const;

export const categoryLabel = (t: T, c: { code: string; name: string }) => (t.has(`enums.CaseCategory.${c.code}`) ? t(`enums.CaseCategory.${c.code}`) : c.name);

export const caseFields = (t: T, users: Option[], clients: Option[], categories: { id: string; code: string; name: string }[]): FieldSpec[] => [
  { name: "title", label: t("cases.request"), required: true, wide: true },
  { name: "categoryId", label: t("cases.category"), type: "select", required: true, options: categories.map((c) => ({ value: c.id, label: categoryLabel(t, c) })) },
  { name: "ownerId", label: t("tasks.owner"), type: "select", required: true, options: users },
  { name: "clientId", label: t("employees.client"), type: "select", options: clients },
  { name: "source", label: t("cases.source"), type: "select", options: CASE_SOURCES.map((s) => ({ value: s, label: t(`enums.CaseSource.${s}`) })) },
  { name: "severity", label: t("cases.severity"), type: "select", options: SEVERITIES.map((s) => ({ value: s, label: t(`enums.Severity.${s}`) })), hint: t("cases.severityHint") },
  { name: "description", label: t("tasks.details"), type: "textarea" },
];

export function StageTracker({ stage, t }: { stage: string; t: T }) {
  const index = FLOW.indexOf(stage as (typeof FLOW)[number]);
  return (
    <ol className="scroll-thin flex items-center gap-1 overflow-x-auto px-5 py-4">
      {FLOW.map((s, i) => {
        const done = index > i || stage === "CLOSED";
        const current = s === stage;
        return (
          <li key={s} className="flex shrink-0 items-center gap-1">
            <span className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs", current ? "bg-primary font-medium text-on-primary" : done ? "bg-success-soft text-success" : "bg-surface-2 text-muted")}>
              {done && !current ? <Check className="size-3" strokeWidth={3} /> : <span className="num">{i + 1}</span>}
              {t(`enums.CaseStage.${s}`)}
            </span>
            {i < FLOW.length - 1 && <span className="h-px w-4 bg-border-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
