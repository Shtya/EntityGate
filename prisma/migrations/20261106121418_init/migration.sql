-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('DIRECT', 'OVERHEAD');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'EXITED');

-- CreateEnum
CREATE TYPE "ClientHealth" AS ENUM ('STRONG', 'WATCH', 'AT_RISK');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('OWNER', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "BillingModel" AS ENUM ('COST_PLUS_PERCENT', 'FIXED_PER_HEAD', 'COST_PLUS_FIXED');

-- CreateEnum
CREATE TYPE "SponsorType" AS ENUM ('OWN', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "WorkerClassification" AS ENUM ('SPONSORED', 'NON_SPONSORED', 'GOSI');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('EMPLOYEE', 'CLIENT', 'CONTRACT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('IQAMA', 'PASSPORT', 'WORK_PERMIT', 'INSURANCE', 'EMPLOYMENT_CONTRACT', 'CLIENT_CONTRACT', 'EXIT_REENTRY_VISA', 'CR', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED', 'MISSING', 'PENDING');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('JOINER', 'TRANSFER', 'RENEWAL', 'EXIT');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('CLIENT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'EXECUTION', 'QC', 'CLIENT_UPDATE', 'PENDING_EXTERNAL', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('CLIENT', 'EMPLOYEE', 'INTERNAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BillingRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('MONTHLY', 'SPONSORSHIP_RENEWAL', 'ONE_OFF', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceLineSource" AS ENUM ('ALLOCATION', 'EXPENSE', 'FEE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "PayrollSource" AS ENUM ('IMPORT', 'MANUAL', 'HR_API');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayableType" AS ENUM ('SALARY', 'GOSI', 'INSURANCE', 'GOV_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderTrigger" AS ENUM ('INVOICE_DUE', 'DOC_EXPIRY', 'CONTRACT_RENEWAL', 'TASK_OVERDUE', 'CASE_SLA', 'PAYABLE_DUE', 'ESCALATION_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ACKED', 'SNOOZED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('EMPLOYEES', 'ALLOCATIONS', 'PAYROLL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATED', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "title" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factors" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "sla_hours" INTEGER,
    "first_response_hours" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "case_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL,
    "recoverable_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "update_within_hours" INTEGER NOT NULL,
    "business_hours_only" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("key","year")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "cr_number" TEXT,
    "vat_number" TEXT,
    "parent_company" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "health" "ClientHealth",
    "notes" TEXT,
    "created_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "is_billing_contact" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_assignments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "billing_model" "BillingModel" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "renewal_notice_days" INTEGER NOT NULL DEFAULT 60,
    "vat_rate" DECIMAL(9,4) NOT NULL DEFAULT 0.15,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "fee_percent" DECIMAL(9,4),
    "fee_per_head" DECIMAL(14,2),
    "fee_fixed_monthly" DECIMAL(14,2),
    "sponsorship_renewal_fee" DECIMAL(14,2),
    "includes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cr_number" TEXT,
    "type" "SponsorType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employee_no" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "nationality" TEXT,
    "iqama_no" TEXT,
    "passport_no" TEXT,
    "date_of_birth" DATE,
    "job_title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sponsor_id" TEXT,
    "classification" "WorkerClassification" NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ONBOARDING',
    "joined_at" DATE,
    "exited_at" DATE,
    "hr_external_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "location_id" TEXT,
    "manager_user_id" TEXT,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "basic" DECIMAL(14,2) NOT NULL,
    "housing" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transport" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gosi_employer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insurance_monthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "owner_type" "DocumentOwnerType" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT,
    "issue_date" DATE,
    "expiry_date" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'VALID',
    "attachment_id" TEXT,
    "notes" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lifecycle_workflows" (
    "id" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lifecycle_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "owner_id" TEXT,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TaskKind" NOT NULL,
    "client_id" TEXT,
    "employee_id" TEXT,
    "case_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "completed_at" TIMESTAMP(3),
    "recurrence_rule" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "client_id" TEXT,
    "employee_id" TEXT,
    "source" "CaseSource" NOT NULL DEFAULT 'INTERNAL',
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "owner_id" TEXT NOT NULL,
    "stage" "CaseStage" NOT NULL DEFAULT 'RECEIVED',
    "sla_due_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "breached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_events" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_stage" "CaseStage",
    "to_stage" "CaseStage" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_comments" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "case_id" TEXT,
    "client_id" TEXT,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "impact_amount" DECIMAL(14,2),
    "impact_text" TEXT,
    "owner_id" TEXT NOT NULL,
    "raised_by_id" TEXT,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_update_due_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_updates" (
    "id" TEXT NOT NULL,
    "escalation_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalation_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_runs" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "BillingRunStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "client_id" TEXT NOT NULL,
    "billing_run_id" TEXT,
    "type" "InvoiceType" NOT NULL,
    "credit_for_id" TEXT,
    "period_start" DATE,
    "period_end" DATE,
    "issue_date" DATE,
    "due_date" DATE,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(9,4) NOT NULL DEFAULT 0.15,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "po_number" TEXT,
    "po_required" BOOLEAN NOT NULL DEFAULT false,
    "issued_by_id" TEXT,
    "pdf_attachment_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" "InvoiceLineSource" NOT NULL,
    "allocation_id" TEXT,
    "employee_id" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "cost_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "received_at" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "proof_attachment_id" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "PayrollSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "client_id" TEXT,
    "gross" DECIMAL(14,2) NOT NULL,
    "gosi" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_costs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL,
    "client_id" TEXT,
    "employee_id" TEXT,
    "case_id" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "incurred_at" DATE NOT NULL,
    "vendor" TEXT,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "billed_line_id" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "attachment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "period" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("period")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" TEXT NOT NULL,
    "type" "PayableType" NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "paid_at" TIMESTAMP(3),
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "ReminderTrigger" NOT NULL,
    "offsets_days" INTEGER[],
    "channels" TEXT[],
    "recipients" TEXT[],
    "escalate_after_hours" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "dedupe_key" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "snoozed_until" TIMESTAMP(3),
    "acked_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "file_attachment_id" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "ok_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "row_no" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "errors" JSONB,
    "result" TEXT,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_syncs" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "result" TEXT,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "integration_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "row_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "two_factors_user_id_idx" ON "two_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_created_at_idx" ON "audit_events"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_region_id_name_key" ON "locations"("region_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "case_categories_code_key" ON "case_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_code_key" ON "expense_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_scope_severity_key" ON "sla_policies"("scope", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "account_assignments_user_id_effective_to_idx" ON "account_assignments"("user_id", "effective_to");

-- CreateIndex
CREATE INDEX "account_assignments_client_id_role_idx" ON "account_assignments"("client_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");

-- CreateIndex
CREATE INDEX "contracts_client_id_idx" ON "contracts"("client_id");

-- CreateIndex
CREATE INDEX "rate_cards_contract_id_effective_from_idx" ON "rate_cards"("contract_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "sponsors_name_key" ON "sponsors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_no_key" ON "employees"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "employees_hr_external_id_key" ON "employees"("hr_external_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_classification_idx" ON "employees"("classification");

-- CreateIndex
CREATE INDEX "allocations_client_id_effective_from_idx" ON "allocations"("client_id", "effective_from");

-- CreateIndex
CREATE INDEX "allocations_employee_id_idx" ON "allocations"("employee_id");

-- CreateIndex
CREATE INDEX "compensations_employee_id_effective_from_idx" ON "compensations"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "documents_owner_type_owner_id_idx" ON "documents"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "documents_expiry_date_idx" ON "documents"("expiry_date");

-- CreateIndex
CREATE INDEX "lifecycle_workflows_employee_id_idx" ON "lifecycle_workflows"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_workflow_id_position_key" ON "workflow_steps"("workflow_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_number_key" ON "tasks"("number");

-- CreateIndex
CREATE INDEX "tasks_owner_id_status_due_at_idx" ON "tasks"("owner_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_client_id_idx" ON "tasks"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_checklist_items_task_id_position_key" ON "task_checklist_items"("task_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "cases_number_key" ON "cases"("number");

-- CreateIndex
CREATE INDEX "cases_owner_id_stage_idx" ON "cases"("owner_id", "stage");

-- CreateIndex
CREATE INDEX "cases_client_id_idx" ON "cases"("client_id");

-- CreateIndex
CREATE INDEX "cases_sla_due_at_idx" ON "cases"("sla_due_at");

-- CreateIndex
CREATE INDEX "case_events_case_id_created_at_idx" ON "case_events"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "escalations_number_key" ON "escalations"("number");

-- CreateIndex
CREATE INDEX "escalations_status_severity_idx" ON "escalations"("status", "severity");

-- CreateIndex
CREATE INDEX "billing_runs_period_idx" ON "billing_runs"("period");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_client_id_status_idx" ON "invoices"("client_id", "status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoice_id_position_key" ON "invoice_lines"("invoice_id", "position");

-- CreateIndex
CREATE INDEX "payments_client_id_received_at_idx" ON "payments"("client_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_period_key" ON "payroll_runs"("period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_payroll_run_id_employee_id_key" ON "payroll_items"("payroll_run_id", "employee_id");

-- CreateIndex
CREATE INDEX "expenses_client_id_incurred_at_idx" ON "expenses"("client_id", "incurred_at");

-- CreateIndex
CREATE INDEX "expenses_kind_incurred_at_idx" ON "expenses"("kind", "incurred_at");

-- CreateIndex
CREATE INDEX "payables_status_due_date_idx" ON "payables"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_job_id_row_no_key" ON "import_rows"("job_id", "row_no");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_assignments" ADD CONSTRAINT "account_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensations" ADD CONSTRAINT "compensations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lifecycle_workflows" ADD CONSTRAINT "lifecycle_workflows_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "lifecycle_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "case_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_comments" ADD CONSTRAINT "case_comments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_comments" ADD CONSTRAINT "case_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_comments" ADD CONSTRAINT "case_comments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_updates" ADD CONSTRAINT "escalation_updates_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "escalations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalation_updates" ADD CONSTRAINT "escalation_updates_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credit_for_id_fkey" FOREIGN KEY ("credit_for_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_billed_line_id_fkey" FOREIGN KEY ("billed_line_id") REFERENCES "invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "reminder_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_file_attachment_id_fkey" FOREIGN KEY ("file_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_logs" ADD CONSTRAINT "export_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════ Hand-written constraints (not expressible in Prisma) ═══════════════════════

-- BR-01: an employee can have at most one allocation effective on any given day.
-- effective_to is exclusive; NULL = open-ended.
ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_no_overlap"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  );

ALTER TABLE "allocations"
  ADD CONSTRAINT "allocations_valid_range" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
ALTER TABLE "account_assignments"
  ADD CONSTRAINT "account_assignments_valid_range" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
ALTER TABLE "compensations"
  ADD CONSTRAINT "compensations_valid_range" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");
ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_valid_range" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from");

-- Only one OWNER per client at a time (ACC-02)
ALTER TABLE "account_assignments"
  ADD CONSTRAINT "account_assignments_single_owner"
  EXCLUDE USING gist (
    "client_id" WITH =,
    daterange("effective_from", "effective_to", '[)') WITH &&
  ) WHERE ("role" = 'OWNER');

-- Money sanity
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_positive" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_positive" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_non_negative" CHECK ("amount" >= 0 AND "vat" >= 0);

-- NFR-06 / IAM-03: audit trail is append-only.
CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_no_update" BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();

-- GEN-01: fuzzy, permission-aware search (permission filter applied in the query layer)
CREATE INDEX "clients_search_trgm" ON "clients" USING gin (("display_name" || ' ' || "legal_name" || ' ' || "code") gin_trgm_ops);
CREATE INDEX "employees_search_trgm" ON "employees" USING gin (("name_en" || ' ' || coalesce("name_ar", '') || ' ' || "employee_no") gin_trgm_ops);
CREATE INDEX "cases_search_trgm" ON "cases" USING gin (("number" || ' ' || "title") gin_trgm_ops);
CREATE INDEX "tasks_search_trgm" ON "tasks" USING gin (("number" || ' ' || "title") gin_trgm_ops);
