import type { FieldSpec } from "@/components/patterns/form-dialog";

type T = (key: string) => string;

export const CLIENT_STATUS_TONE = { PROSPECT: "neutral", ONBOARDING: "info", ACTIVE: "success", SUSPENDED: "warning", EXITED: "neutral" } as const;
export const HEALTH_TONE = { STRONG: "success", WATCH: "warning", AT_RISK: "danger" } as const;

export const clientFields = (t: T): FieldSpec[] => [
  { name: "displayName", label: t("clients.displayName"), required: true },
  { name: "legalName", label: t("clients.legalName"), required: true },
  { name: "crNumber", label: t("clients.crNumber"), ltr: true },
  { name: "vatNumber", label: t("clients.vatNumber"), ltr: true },
  { name: "parentCompany", label: t("clients.parentCompany") },
  { name: "country", label: t("clients.country") },
  { name: "industry", label: t("clients.industry") },
  { name: "notes", label: t("common.notes"), type: "textarea" },
];
