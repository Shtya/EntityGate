-- Someone moved between clients mid-month needs one payroll line per client, so each client's
-- P&L carries only its own days.
DROP INDEX IF EXISTS "payroll_items_payroll_run_id_employee_id_key";
CREATE UNIQUE INDEX "payroll_items_payroll_run_id_employee_id_client_id_key" ON "payroll_items"("payroll_run_id", "employee_id", "client_id");
