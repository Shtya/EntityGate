-- Client reply, 24 Nov: one client can have two rates, because its employees are split between our
-- sponsorship and the client's own (Al-Esayi: 9%/9% and 13%/0%). Blank means the main rates apply.
ALTER TABLE "rate_cards"
    ADD COLUMN "client_sponsor_fee_percent" DECIMAL(9,4),
    ADD COLUMN "client_sponsor_fee_indirect_percent" DECIMAL(9,4);

-- Which group each invoiced employee was billed under, shown on the breakdown.
ALTER TABLE "invoice_line_breakdowns"
    ADD COLUMN "own_sponsorship" BOOLEAN NOT NULL DEFAULT true;
