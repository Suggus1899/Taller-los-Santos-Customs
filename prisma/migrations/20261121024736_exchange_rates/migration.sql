-- CreateEnum
CREATE TYPE "rate_source" AS ENUM ('OFICIAL', 'PARALELO');

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" SERIAL NOT NULL,
    "source" "rate_source" NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_source_published_at_key" ON "exchange_rates"("source", "published_at");

ALTER TABLE "exchange_rates" ADD CONSTRAINT "ck_exchange_rates_rate_positive" CHECK ("rate" > 0);
