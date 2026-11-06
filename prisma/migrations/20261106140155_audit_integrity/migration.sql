-- DropForeignKey
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_actor_id_fkey";

-- CreateIndex
CREATE INDEX "allocations_location_id_idx" ON "allocations"("location_id");

-- CreateIndex
CREATE INDEX "allocations_manager_user_id_idx" ON "allocations"("manager_user_id");

-- CreateIndex
CREATE INDEX "case_comments_case_id_idx" ON "case_comments"("case_id");

-- CreateIndex
CREATE INDEX "case_comments_author_id_idx" ON "case_comments"("author_id");

-- CreateIndex
CREATE INDEX "case_events_actor_id_idx" ON "case_events"("actor_id");

-- CreateIndex
CREATE INDEX "cases_employee_id_idx" ON "cases"("employee_id");

-- CreateIndex
CREATE INDEX "cases_category_id_idx" ON "cases"("category_id");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE INDEX "employees_sponsor_id_idx" ON "employees"("sponsor_id");

-- CreateIndex
CREATE INDEX "escalation_updates_escalation_id_idx" ON "escalation_updates"("escalation_id");

-- CreateIndex
CREATE INDEX "escalations_case_id_idx" ON "escalations"("case_id");

-- CreateIndex
CREATE INDEX "escalations_client_id_idx" ON "escalations"("client_id");

-- CreateIndex
CREATE INDEX "escalations_owner_id_idx" ON "escalations"("owner_id");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_employee_id_idx" ON "expenses"("employee_id");

-- CreateIndex
CREATE INDEX "expenses_case_id_idx" ON "expenses"("case_id");

-- CreateIndex
CREATE INDEX "expenses_billed_line_id_idx" ON "expenses"("billed_line_id");

-- CreateIndex
CREATE INDEX "export_logs_user_id_idx" ON "export_logs"("user_id");

-- CreateIndex
CREATE INDEX "export_logs_created_at_idx" ON "export_logs"("created_at");

-- CreateIndex
CREATE INDEX "invoice_lines_allocation_id_idx" ON "invoice_lines"("allocation_id");

-- CreateIndex
CREATE INDEX "invoice_lines_employee_id_idx" ON "invoice_lines"("employee_id");

-- CreateIndex
CREATE INDEX "invoices_billing_run_id_idx" ON "invoices"("billing_run_id");

-- CreateIndex
CREATE INDEX "invoices_credit_for_id_idx" ON "invoices"("credit_for_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notifications_rule_id_idx" ON "notifications"("rule_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "payroll_items_employee_id_idx" ON "payroll_items"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_items_client_id_idx" ON "payroll_items"("client_id");

-- CreateIndex
CREATE INDEX "task_comments_task_id_idx" ON "task_comments"("task_id");

-- CreateIndex
CREATE INDEX "task_comments_author_id_idx" ON "task_comments"("author_id");

-- CreateIndex
CREATE INDEX "tasks_employee_id_idx" ON "tasks"("employee_id");

-- CreateIndex
CREATE INDEX "tasks_case_id_idx" ON "tasks"("case_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");

-- CreateIndex
CREATE INDEX "workflow_steps_owner_id_idx" ON "workflow_steps"("owner_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══════════════════════ Hand-written constraints (audit pass) ═══════════════════════

-- One salary and one price at a time: overlapping rows would double-bill silently.
ALTER TABLE "compensations"
  ADD CONSTRAINT "compensations_no_overlap"
  EXCLUDE USING gist ("employee_id" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&);
ALTER TABLE "rate_cards"
  ADD CONSTRAINT "rate_cards_no_overlap"
  EXCLUDE USING gist ("contract_id" WITH =, daterange("effective_from", "effective_to", '[)') WITH &&);

-- Invoice arithmetic can't drift, whatever code path writes the row.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_consistent" CHECK ("total" = "subtotal" + "vat_amount");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vat_rate_range" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 1);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vat_rate_range" CHECK ("vat_rate" >= 0 AND "vat_rate" <= 1);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_payment_terms_non_negative" CHECK ("payment_terms_days" >= 0);
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_fee_percent_range" CHECK ("fee_percent" IS NULL OR ("fee_percent" >= 0 AND "fee_percent" <= 1));
ALTER TABLE "compensations" ADD CONSTRAINT "compensations_non_negative" CHECK ("basic" >= 0 AND "housing" >= 0 AND "transport" >= 0 AND "other" >= 0 AND "gosi_employer" >= 0 AND "insurance_monthly" >= 0);
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_non_negative" CHECK ("gross" >= 0 AND "gosi" >= 0 AND "other_costs" >= 0 AND "total_cost" >= 0);
ALTER TABLE "payables" ADD CONSTRAINT "payables_positive" CHECK ("amount" > 0);

-- Periods are real calendar months.
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- A second live run for a month would invoice clients twice.
CREATE UNIQUE INDEX "billing_runs_one_live_per_period" ON "billing_runs" ("period") WHERE "status" <> 'CANCELLED';

-- Money applied can't exceed the payment received or the invoice owed.
-- Locks both parents, so two concurrent allocations can't each pass the check and over-collect together.
CREATE OR REPLACE FUNCTION payment_allocations_check_limits() RETURNS trigger AS $$
DECLARE
  payment_amount NUMERIC(14,2);
  invoice_total NUMERIC(14,2);
  applied_to_payment NUMERIC(14,2);
  applied_to_invoice NUMERIC(14,2);
BEGIN
  SELECT "amount" INTO payment_amount FROM "payments" WHERE "id" = NEW."payment_id" FOR UPDATE;
  SELECT "total" INTO invoice_total FROM "invoices" WHERE "id" = NEW."invoice_id" FOR UPDATE;

  SELECT COALESCE(SUM("amount"), 0) INTO applied_to_payment FROM "payment_allocations"
    WHERE "payment_id" = NEW."payment_id" AND "id" <> NEW."id";
  SELECT COALESCE(SUM("amount"), 0) INTO applied_to_invoice FROM "payment_allocations"
    WHERE "invoice_id" = NEW."invoice_id" AND "id" <> NEW."id";

  IF applied_to_payment + NEW."amount" > payment_amount THEN
    RAISE EXCEPTION 'payment allocation exceeds the payment amount' USING ERRCODE = '23514';
  END IF;
  IF applied_to_invoice + NEW."amount" > invoice_total THEN
    RAISE EXCEPTION 'payment allocation exceeds the invoice total' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_allocations_limits" BEFORE INSERT OR UPDATE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION payment_allocations_check_limits();
