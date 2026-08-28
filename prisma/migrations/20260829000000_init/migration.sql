-- CreateEnum
CREATE TYPE "sex" AS ENUM ('Male', 'Female', 'Other', 'Decline to Answer');

-- CreateTable
CREATE TABLE "patients" (
    "patient_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "sex" "sex" NOT NULL,
    "phone_number" CHAR(10) NOT NULL,
    "address_line_1" VARCHAR(200) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zip_code" VARCHAR(10) NOT NULL,
    "email" VARCHAR(254),
    "address_line_2" VARCHAR(200),
    "insurance_provider" VARCHAR(150),
    "insurance_member_id" VARCHAR(100),
    "preferred_language" VARCHAR(60) NOT NULL DEFAULT 'English',
    "emergency_contact_name" VARCHAR(200),
    "emergency_contact_phone" CHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "patients_pkey" PRIMARY KEY ("patient_id")
);

-- CreateIndex
CREATE INDEX "patients_last_name_idx" ON "patients"("last_name");
CREATE INDEX "patients_phone_number_idx" ON "patients"("phone_number");
CREATE INDEX "patients_date_of_birth_idx" ON "patients"("date_of_birth");
CREATE INDEX "patients_deleted_at_idx" ON "patients"("deleted_at");

-- Constraints the ORM layer can't express. The assignment asks for type/constraint
-- enforcement at the DB layer, so these live here rather than only in JS.
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_dob_not_future" CHECK ("date_of_birth" <= CURRENT_DATE),
  ADD CONSTRAINT "patients_dob_sane_floor" CHECK ("date_of_birth" >= DATE '1900-01-01'),
  ADD CONSTRAINT "patients_phone_10_digits" CHECK ("phone_number" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "patients_emergency_phone_10_digits" CHECK ("emergency_contact_phone" IS NULL OR "emergency_contact_phone" ~ '^[0-9]{10}$'),
  ADD CONSTRAINT "patients_state_two_letters" CHECK ("state" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "patients_zip_format" CHECK ("zip_code" ~ '^[0-9]{5}(-[0-9]{4})?$'),
  ADD CONSTRAINT "patients_email_format" CHECK ("email" IS NULL OR "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  ADD CONSTRAINT "patients_first_name_not_blank" CHECK (length(btrim("first_name")) > 0),
  ADD CONSTRAINT "patients_last_name_not_blank" CHECK (length(btrim("last_name")) > 0);
