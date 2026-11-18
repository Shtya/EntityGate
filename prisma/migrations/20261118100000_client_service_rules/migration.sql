-- Client feedback 18 Nov: each client sets, per service, whether it applies, which invoice it goes
-- on (monthly payroll or a separate expenses invoice), and its own fee.
ALTER TYPE "InvoiceType" ADD VALUE IF NOT EXISTS 'MONTHLY_EXPENSES';

CREATE TABLE "client_service_rules" (
    "client_id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "part" TEXT NOT NULL DEFAULT 'PAYROLL',
    "fee_type" TEXT,
    "fee_value" DECIMAL(14,4),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_service_rules_pkey" PRIMARY KEY ("client_id", "service"),
    CONSTRAINT "client_service_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "client_service_rules_part_check" CHECK ("part" IN ('PAYROLL', 'EXPENSES')),
    CONSTRAINT "client_service_rules_fee_check" CHECK (("fee_type" IS NULL AND "fee_value" IS NULL) OR ("fee_type" IN ('PERCENT', 'FIXED') AND "fee_value" >= 0))
);

-- A breakdown row records which invoice it belongs to and the client's rules at the time,
-- so a draft recalculates with the rules it was built with.
ALTER TABLE "invoice_line_breakdowns"
    ADD COLUMN "part" TEXT NOT NULL DEFAULT 'PAYROLL',
    ADD COLUMN "rules" JSONB NOT NULL DEFAULT '{}';
