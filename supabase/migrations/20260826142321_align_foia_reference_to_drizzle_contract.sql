-- Align foia_statutes / foia_agencies to the drizzle/schema.ts contract the app
-- actually reads (quoted camelCase columns), and create the routing tables
-- foia_record_types + foia_agency_records that the generator was designed around.
-- Backfills from the snake_case enrichment columns added in
-- flesh_out_foia_reference_tables; those provenance columns are kept as extras.

-- ─── enums (as drizzle pgEnum expects) ───
DO $$ BEGIN
  CREATE TYPE foia_agencies_jurisdiction_level_enum AS ENUM ('federal','state','county','municipal','court');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE foia_agencies_submission_methods_enum AS ENUM ('portal','email','mail','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE foia_agency_records_confidence_enum AS ENUM ('high','medium','low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── foia_statutes ───
ALTER TABLE foia_statutes RENAME COLUMN state_code TO "stateCode";
ALTER TABLE foia_statutes
  ADD COLUMN IF NOT EXISTS "lawName" varchar(256),
  ADD COLUMN IF NOT EXISTS "statuteReference" varchar(256),
  ADD COLUMN IF NOT EXISTS "responseDeadlineDays" integer,
  ADD COLUMN IF NOT EXISTS "appealDeadlineDays" integer,
  ADD COLUMN IF NOT EXISTS "feeWaiverAvailable" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expeditedProcessingAvailable" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;
UPDATE foia_statutes SET
  "lawName" = statute_name,
  "statuteReference" = citation,
  "responseDeadlineDays" = response_days,
  "feeWaiverAvailable" = true,
  "expeditedProcessingAvailable" = ("stateCode" = 'US'),
  notes = coalesce(extension_rule,'') || CASE WHEN extension_rule IS NOT NULL AND appeal_note IS NOT NULL THEN ' | ' ELSE '' END || coalesce(appeal_note,'')
WHERE "lawName" IS NULL;
ALTER TABLE foia_statutes
  ALTER COLUMN "lawName" SET NOT NULL,
  ALTER COLUMN "statuteReference" SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foia_statutes_state ON foia_statutes ("stateCode");

-- ─── foia_agencies ───
ALTER TABLE foia_agencies RENAME COLUMN state_code TO "stateCode";
ALTER TABLE foia_agencies
  ADD COLUMN IF NOT EXISTS "jurisdictionLevel" foia_agencies_jurisdiction_level_enum NOT NULL DEFAULT 'federal',
  ADD COLUMN IF NOT EXISTS "agencyName" varchar(256),
  ADD COLUMN IF NOT EXISTS "agencyComponent" varchar(256),
  ADD COLUMN IF NOT EXISTS "portalUrl" text,
  ADD COLUMN IF NOT EXISTS "mailingAddress" text,
  ADD COLUMN IF NOT EXISTS "submissionMethods" foia_agencies_submission_methods_enum NOT NULL DEFAULT 'mixed',
  ADD COLUMN IF NOT EXISTS notes text;
UPDATE foia_agencies SET
  "agencyName" = agency_name,
  "agencyComponent" = component_name,
  "portalUrl" = submission_portal,
  "mailingAddress" = address,
  "submissionMethods" = CASE
     WHEN submission_portal IS NOT NULL AND email IS NOT NULL THEN 'mixed'::foia_agencies_submission_methods_enum
     WHEN submission_portal IS NOT NULL THEN 'portal'::foia_agencies_submission_methods_enum
     WHEN email IS NOT NULL THEN 'email'::foia_agencies_submission_methods_enum
     ELSE 'mail'::foia_agencies_submission_methods_enum END
WHERE "agencyName" IS NULL;
ALTER TABLE foia_agencies ALTER COLUMN "agencyName" SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foia_agencies_state ON foia_agencies ("stateCode");
CREATE INDEX IF NOT EXISTS idx_foia_agencies_jurisdiction ON foia_agencies ("jurisdictionLevel");

-- ─── foia_record_types ───
CREATE TABLE IF NOT EXISTS foia_record_types (
  id serial PRIMARY KEY,
  domain varchar(64) NOT NULL,
  "recordType" varchar(128) NOT NULL,
  "recordDescription" text NOT NULL,
  "typicalKeywords" jsonb,
  "retentionNotes" text
);
CREATE INDEX IF NOT EXISTS idx_foia_record_types_domain ON foia_record_types (domain);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foia_record_types_unique ON foia_record_types (domain, "recordType");

-- ─── foia_agency_records (routing: record type → agency + statute + confidence) ───
CREATE TABLE IF NOT EXISTS foia_agency_records (
  id serial PRIMARY KEY,
  "agencyId" integer NOT NULL REFERENCES foia_agencies(id),
  "recordTypeId" integer NOT NULL REFERENCES foia_record_types(id),
  "statuteId" integer NOT NULL REFERENCES foia_statutes(id),
  confidence foia_agency_records_confidence_enum NOT NULL DEFAULT 'medium',
  notes text
);
CREATE INDEX IF NOT EXISTS idx_foia_agency_records_agency ON foia_agency_records ("agencyId");
CREATE INDEX IF NOT EXISTS idx_foia_agency_records_record ON foia_agency_records ("recordTypeId");
CREATE INDEX IF NOT EXISTS idx_foia_agency_records_statute ON foia_agency_records ("statuteId");
