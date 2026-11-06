import type { FieldSpec } from "@/components/patterns/form-dialog";
import { CLASSIFICATIONS, DOCUMENT_TYPES } from "@/server/modules/employees/schema";
import type { Option } from "@/components/ui/select";

type T = (key: string, values?: Record<string, string | number>) => string;

export const EMPLOYEE_STATUS_TONE = { ONBOARDING: "info", ACTIVE: "success", OFFBOARDING: "warning", EXITED: "neutral" } as const;
export const DOC_TONE = { VALID: "success", EXPIRING: "warning", EXPIRED: "danger", NO_EXPIRY: "neutral" } as const;

export const employeeFields = (t: T, sponsors: Option[], withNo = false): FieldSpec[] => [
  { name: "nameEn", label: t("employees.nameEn"), required: true },
  { name: "nameAr", label: t("employees.nameAr") },
  ...(withNo ? [{ name: "employeeNo", label: t("employees.employeeNo"), ltr: true, hint: t("employees.employeeNoHint") } satisfies FieldSpec] : []),
  { name: "classification", label: t("employees.classification"), type: "select", required: true, options: CLASSIFICATIONS.map((c) => ({ value: c, label: t(`enums.WorkerClassification.${c}`) })) },
  { name: "sponsorId", label: t("employees.sponsor"), type: "select", options: sponsors },
  { name: "jobTitle", label: t("employees.jobTitle") },
  { name: "nationality", label: t("employees.nationality") },
  { name: "iqamaNo", label: t("employees.iqamaNo"), ltr: true },
  { name: "passportNo", label: t("employees.passportNo"), ltr: true },
  { name: "dateOfBirth", label: t("employees.dateOfBirth"), type: "date" },
  { name: "joinedAt", label: t("employees.joinedAt"), type: "date" },
  { name: "email", label: t("clients.email"), type: "email" },
  { name: "phone", label: t("clients.phone"), type: "tel" },
];

export const documentFields = (t: T): FieldSpec[] => [
  { name: "type", label: t("employees.docType"), type: "select", required: true, options: DOCUMENT_TYPES.map((d) => ({ value: d, label: t(`enums.DocumentType.${d}`) })) },
  { name: "number", label: t("employees.docNumber"), ltr: true },
  { name: "issueDate", label: t("employees.issueDate"), type: "date" },
  { name: "expiryDate", label: t("employees.expiryDate"), type: "date" },
  { name: "attachmentId", label: t("employees.file"), type: "file", wide: true },
];
