-- Task categories ("services"), more people on a task, on-hold reasons and the finance step,
-- matching the client's existing task system.
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'WAITING_FINANCE';

CREATE TABLE "task_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "task_categories_name_key" ON "task_categories"("name");

-- RESTRICT: a category that tasks use can only be archived, never deleted out from under them.
CREATE TABLE "task_category_links" (
    "task_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    CONSTRAINT "task_category_links_pkey" PRIMARY KEY ("task_id", "category_id"),
    CONSTRAINT "task_category_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "task_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "task_category_links_category_id_idx" ON "task_category_links"("category_id");

CREATE TABLE "task_employees" (
    "task_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    CONSTRAINT "task_employees_pkey" PRIMARY KEY ("task_id", "employee_id"),
    CONSTRAINT "task_employees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_employees_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "task_employees_employee_id_idx" ON "task_employees"("employee_id");

ALTER TABLE "tasks"
    ADD COLUMN "hr_rep_id" TEXT,
    ADD COLUMN "account_manager_id" TEXT,
    ADD COLUMN "only_me" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "client_email" TEXT,
    ADD COLUMN "finance_required" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "finance_cleared_at" TIMESTAMP(3),
    ADD COLUMN "hold_reason" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_hr_rep_id_fkey" FOREIGN KEY ("hr_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_hr_rep_id_idx" ON "tasks"("hr_rep_id");
CREATE INDEX "tasks_account_manager_id_idx" ON "tasks"("account_manager_id");
