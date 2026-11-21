-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "audit_entity" AS ENUM ('USER', 'APPOINTMENT', 'QUOTE_REQUEST', 'CONTACT_MESSAGE');

-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('SEDAN', 'SUV', 'PICKUP', 'SPORT');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('NEW', 'CONTACTED', 'ACCEPTED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(80),
    "role" "user_role" NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "sid" VARCHAR(128) NOT NULL,
    "data" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "action" "audit_action" NOT NULL,
    "entity_type" "audit_entity" NOT NULL,
    "entity_id" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "description" VARCHAR(80) NOT NULL,
    "type" "vehicle_type",
    "plate" VARCHAR(12),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER,
    "service_slug" VARCHAR(40) NOT NULL,
    "scheduled_date" DATE NOT NULL,
    "time_slot" CHAR(5) NOT NULL,
    "status" "appointment_status" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "vehicle_type" "vehicle_type" NOT NULL,
    "service_code" VARCHAR(20) NOT NULL,
    "extra_code" VARCHAR(20) NOT NULL,
    "estimate_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "notes" VARCHAR(1000),
    "status" "quote_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_customer_id_description_key" ON "vehicles"("customer_id", "description");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_public_id_key" ON "appointments"("public_id");

-- CreateIndex
CREATE INDEX "appointments_scheduled_date_time_slot_idx" ON "appointments"("scheduled_date", "time_slot");

-- CreateIndex
CREATE INDEX "appointments_status_scheduled_date_idx" ON "appointments"("status", "scheduled_date");

-- CreateIndex
CREATE INDEX "appointments_customer_id_idx" ON "appointments"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_public_id_key" ON "quote_requests"("public_id");

-- CreateIndex
CREATE INDEX "quote_requests_status_created_at_idx" ON "quote_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "quote_requests_customer_id_idx" ON "quote_requests"("customer_id");

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_customer_id_idx" ON "contact_messages"("customer_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Restricciones que Prisma no expresa en el esquema ─────────────

-- Un único turno activo por fecha y hora: las citas canceladas liberan el turno.
-- Evita dobles reservas incluso con peticiones simultáneas.
CREATE UNIQUE INDEX "uq_appointments_active_slot"
  ON "appointments" ("scheduled_date", "time_slot")
  WHERE "status" <> 'CANCELLED';

ALTER TABLE "appointments"
  ADD CONSTRAINT "ck_appointments_time_slot" CHECK ("time_slot" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "quote_requests"
  ADD CONSTRAINT "ck_quote_requests_estimate" CHECK ("estimate_cents" >= 0),
  ADD CONSTRAINT "ck_quote_requests_currency" CHECK ("currency" ~ '^[A-Z]{3}$');

-- Correos y usuarios se guardan normalizados en minúsculas.
ALTER TABLE "customers"
  ADD CONSTRAINT "ck_customers_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users"
  ADD CONSTRAINT "ck_users_username_lowercase" CHECK ("username" = lower("username"));
