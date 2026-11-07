import { z } from "zod";
import { optDate, optEmail, optId, optMoney, optText, pageQuery, reqId, reqText } from "@/server/validation";

export const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "WAITING_FINANCE", "DONE", "CANCELLED"] as const;
/** What a task can start in. WAITING_FINANCE is only reached by finishing a task that needs payment. */
export const START_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;
export const RECURRENCES = ["NONE", "WEEKLY", "MONTHLY"] as const;
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const CASE_STAGES = ["RECEIVED", "UNDER_REVIEW", "EXECUTION", "PENDING_EXTERNAL", "QC", "CLIENT_UPDATE", "CLOSED", "REOPENED"] as const;
export const CASE_SOURCES = ["CLIENT", "EMPLOYEE", "INTERNAL", "SYSTEM"] as const;

const ids = (max: number) => z.array(reqId).max(max).nullish().transform((v) => [...new Set(v ?? [])]);

export const taskSchema = z
  .object({
    title: reqText(300),
    description: optText(4000),
    type: z.enum(["CLIENT", "INTERNAL"]).nullish(),
    categoryIds: ids(20),
    clientId: optId,
    employeeId: optId,
    employeeIds: ids(50),
    caseId: optId,
    /** Required unless "only me", which assigns the task to whoever creates it. */
    ownerId: optId,
    onlyMe: z.boolean().nullish(),
    hrRepId: optId,
    accountManagerId: optId,
    clientEmail: optEmail,
    dueAt: optDate,
    priority: z.enum(PRIORITIES, { error: "validation.required" }),
    status: z.enum(START_STATUSES).nullish(),
    holdReason: optText(500),
    financeRequired: z.boolean().nullish(),
    recurrence: z.enum(RECURRENCES).nullish(),
  })
  .superRefine((v, ctx) => {
    if (!v.ownerId && !v.onlyMe) ctx.addIssue({ code: "custom", path: ["ownerId"], message: "validation.required" });
    if (v.status === "BLOCKED" && !v.holdReason) ctx.addIssue({ code: "custom", path: ["holdReason"], message: "validation.required" });
  });
export type TaskInput = z.infer<typeof taskSchema>;

export const taskStatusSchema = z
  .object({ status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]), reason: optText(500) })
  .superRefine((v, ctx) => {
    if (v.status === "BLOCKED" && !v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "validation.required" });
  });
export const reassignSchema = z.object({ ownerId: reqId });
export const commentSchema = z.object({ body: reqText(4000), attachmentId: optId });

export const listTasksQuery = z.object({
  ...pageQuery,
  view: z.enum(["mine", "onlyMe", "team", "overdue", "finance", "all"]).catch("mine").default("mine"),
  status: z.enum(TASK_STATUSES).optional().catch(undefined),
  client: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  owner: z.string().max(50).optional(),
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
