import { z } from "zod";
import { optDate, optEmail, optId, optMoney, optText, pageQuery, reqDate, reqId, reqMoney, reqText } from "@/server/validation";

export const CLASSIFICATIONS = ["SPONSORED", "NON_SPONSORED", "GOSI"] as const;
export const EMPLOYEE_STATUSES = ["ONBOARDING", "ACTIVE", "OFFBOARDING", "EXITED"] as const;
export const DOCUMENT_TYPES = ["IQAMA", "PASSPORT", "WORK_PERMIT", "INSURANCE", "EMPLOYMENT_CONTRACT", "CLIENT_CONTRACT", "EXIT_REENTRY_VISA", "CR", "OTHER"] as const;

const profile = {
  nameEn: reqText(120),
  nameAr: optText(120),
  nationality: optText(80),
  iqamaNo: optText(20),
  passportNo: optText(20),
  dateOfBirth: optDate,
  jobTitle: optText(120),
  email: optEmail,
  phone: optText(32),
  sponsorId: optId,
  classification: z.enum(CLASSIFICATIONS, { error: "validation.required" }),
  joinedAt: optDate,
};

export const employeeCreateSchema = z.object({
  ...profile,
  employeeNo: optText(30),
  clientId: optId,
  effectiveFrom: optDate,
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object(profile);
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export const allocationSchema = z.object({
  clientId: reqId,
  locationId: optId,
  managerUserId: optId,
  effectiveFrom: reqDate,
  billable: z.boolean().nullish(),
});
export type AllocationInput = z.infer<typeof allocationSchema>;

export const compensationSchema = z.object({
  effectiveFrom: reqDate,
  basic: reqMoney,
  housing: optMoney,
  transport: optMoney,
  other: optMoney,
  gosiEmployer: optMoney,
  insuranceMonthly: optMoney,
});
export type CompensationInput = z.infer<typeof compensationSchema>;

export const documentSchema = z.object({
  ownerType: z.enum(["EMPLOYEE", "CLIENT", "CONTRACT"]),
  ownerId: reqId,
  type: z.enum(DOCUMENT_TYPES, { error: "validation.required" }),
  number: optText(60),
  issueDate: optDate,
  expiryDate: optDate,
  attachmentId: optId,
  notes: optText(500),
});
export type DocumentInput = z.infer<typeof documentSchema>;

export const exitSchema = z.object({ lastWorkingDay: reqDate });

export const listEmployeesQuery = z.object({
  ...pageQuery,
  status: z.enum(EMPLOYEE_STATUSES).optional().catch(undefined),
  classification: z.enum(CLASSIFICATIONS).optional().catch(undefined),
  client: z.string().max(50).optional(),
  sponsor: z.string().max(50).optional(),
  attention: z.enum(["expiring", "unallocated"]).optional().catch(undefined),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuery>;
