-- Client feedback 17 Nov: invoices broken down per employee the way the client's sheet does it.

-- Fees: a separate rate on indirect costs, a per-day fee, and whether end-of-service is billed.
ALTER TYPE "BillingModel" ADD VALUE IF NOT EXISTS 'PER_DAY';
ALTER TABLE "rate_cards"
    ADD COLUMN "fee_indirect_percent" DECIMAL(9,4),
    ADD COLUMN "fee_per_day" DECIMAL(14,2),
    ADD COLUMN "bill_end_of_service" BOOLEAN NOT NULL DEFAULT true;

-- Standing monthly charges billed to the client for each employee. Four decimals so yearly
-- costs spread over 12 months (2000 / 12) keep the sheet's precision.
ALTER TABLE "compensations"
    ADD COLUMN "iqama_renewal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "exit_reentry" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "flight_ticket" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "iqama_transfer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "admin_fee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "dependants_fees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    ADD COLUMN "ajeer" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- One row per employee line on a monthly invoice: every column of the client's sheet. Monthly
-- amounts are stored unprorated, with the fee terms used, so a draft can be recalculated after edits.
CREATE TABLE "invoice_line_breakdowns" (
    "line_id" TEXT NOT NULL,
    "employee_name" TEXT NOT NULL,
    "region" TEXT,
    "joined_at" DATE,
    "salary" DECIMAL(14,4) NOT NULL,
    "workdays" DECIMAL(6,2) NOT NULL,
    "deductions" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "gas_support" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "kpi" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "medical" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "gosi" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iqama_renewal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "exit_reentry" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "flight_ticket" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "iqama_transfer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "admin_fee" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "dependants_fees" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ajeer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "sponsorship_transfer" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "new_visa" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "payout" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "other" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "bill_eos" BOOLEAN NOT NULL DEFAULT true,
    "fee_model" "BillingModel" NOT NULL,
    "direct_rate" DECIMAL(9,4),
    "indirect_rate" DECIMAL(9,4),
    "per_head" DECIMAL(14,2),
    "per_day" DECIMAL(14,2),
    CONSTRAINT "invoice_line_breakdowns_pkey" PRIMARY KEY ("line_id"),
    CONSTRAINT "invoice_line_breakdowns_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "invoice_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invoice_line_breakdowns_workdays_check" CHECK ("workdays" >= 0 AND "workdays" <= 31)
);
