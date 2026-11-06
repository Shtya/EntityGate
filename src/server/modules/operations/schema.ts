import { z } from "zod";
import { optDate, optId, optMoney, optText, pageQuery, reqId, reqText } from "@/server/validation";

export const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] as const;
export const RECURRENCES = ["NONE", "WEEKLY", "MONTHLY"] as const;
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const CASE_STAGES = ["RECEIVED", "UNDER_REVIEW", "EXECUTION", "PENDING_EXTERNAL", "QC", "CLIENT_UPDATE", "CLOSED", "REOPENED"] as const;
export const CASE_SOURCES = ["CLIENT", "EMPLOYEE", "INTERNAL", "SYSTEM"] as const;

export const taskSchema = z.object({
  title: reqText(200),
  description: optText(4000),
  clientId: optId,
  employeeId: optId,
  caseId: optId,
  ownerId: reqId,
  dueAt: optDate,
  priority: z.enum(PRIORITIES, { error: "validation.required" }),
  recurrence: z.enum(RECURRENCES).nullish(),
});
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z.object({ status: z.enum(TASK_STATUSES) });
export const reassignSchema = z.object({ ownerId: reqId });
export const commentSchema = z.object({ body: reqText(4000), attachmentId: optId });

export const listTasksQuery = z.object({
  ...pageQuery,
  view: z.enum(["mine", "team", "overdue", "all"]).catch("mine").default("mine"),
  status: z.enum(TASK_STATUSES).optional().catch(undefined),
  client: z.string().max(50).optional(),
  layout: z.enum(["list", "board"]).catch("list").default("list"),
});
export type ListTasksQuery = z.infer<typeof listTasksQuery>;

export const caseSchema = z.object({
  title: reqText(200),
  description: optText(4000),
  categoryId: reqId,
  clientId: optId,
  employeeId: optId,
  source: z.enum(CASE_SOURCES).nullish(),
  severity: z.enum(SEVERITIES).nullish(),
  ownerId: reqId,
});
export type CaseInput = z.infer<typeof caseSchema>;

export const stageSchema = z.object({ stage: z.enum(CASE_STAGES), note: optText(1000) });
export const closeCaseSchema = z.object({ resolutionNote: reqText(4000), attachmentId: optId });
export const reopenSchema = z.object({ reason: reqText(1000) });

export const listCasesQuery = z.object({
  ...pageQuery,
  view: z.enum(["open", "overdue", "mine", "all"]).catch("open").default("open"),
  stage: z.enum(CASE_STAGES).optional().catch(undefined),
  client: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
});
export type ListCasesQuery = z.infer<typeof listCasesQuery>;

export const escalationSchema = z.object({
  title: reqText(200),
  severity: z.enum(SEVERITIES, { error: "validation.required" }),
  clientId: optId,
  caseId: optId,
  ownerId: reqId,
  impactAmount: optMoney,
  impactText: optText(200),
});
export type EscalationInput = z.infer<typeof escalationSchema>;

export const escalationUpdateSchema = z.object({ note: reqText(2000) });
export const listEscalationsQuery = z.object({ ...pageQuery, status: z.enum(["active", "resolved"]).catch("active").default("active") });
