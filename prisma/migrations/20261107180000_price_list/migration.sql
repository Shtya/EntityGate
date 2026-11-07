-- What the company charges for each service, before VAT.
CREATE TYPE "ServiceUnit" AS ENUM ('PER_REQUEST', 'PER_EMPLOYEE', 'PER_MONTH', 'PER_YEAR');

CREATE TABLE "service_prices" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT,
    "unit" "ServiceUnit" NOT NULL DEFAULT 'PER_REQUEST',
    "price" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_prices_price_check" CHECK ("price" >= 0)
);
CREATE UNIQUE INDEX "service_prices_code_key" ON "service_prices"("code");
