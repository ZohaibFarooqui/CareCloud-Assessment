-- The spec caps names at 50 characters and restricts them to alphabetic
-- characters plus hyphens and apostrophes. Spaces are permitted as well, since
-- "Van Der Berg" is a real surname; [[:alpha:]] keeps accented names valid.

ALTER TABLE "patients" ALTER COLUMN "first_name" TYPE VARCHAR(50);
ALTER TABLE "patients" ALTER COLUMN "last_name" TYPE VARCHAR(50);

-- Superseded by the format checks below, which also imply non-blank.
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_first_name_not_blank";
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_last_name_not_blank";

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_first_name_format" CHECK ("first_name" ~ '^[[:alpha:]][[:alpha:]'' -]*$'),
  ADD CONSTRAINT "patients_last_name_format" CHECK ("last_name" ~ '^[[:alpha:]][[:alpha:]'' -]*$');
