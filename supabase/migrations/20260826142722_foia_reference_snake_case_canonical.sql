-- Corrective: production convention is snake_case; the camelCase drizzle defs were
-- pre-transition artifacts. Revert the camelCase alignment, keep snake_case as
-- canonical, and create the routing tables in snake_case.

-- ─── foia_statutes: back to snake ───
ALTER TABLE foia_statutes RENAME COLUMN "stateCode" TO state_code;
ALTER TABLE foia_statutes
  DROP COLUMN IF EXISTS "lawName",
  DROP COLUMN IF EXISTS "statuteReference",
  DROP COLUMN IF EXISTS "responseDeadlineDays",
  DROP COLUMN IF EXISTS "appealDeadlineDays",
  DROP COLUMN IF EXISTS "feeWaiverAvailable",
  DROP COLUMN IF EXISTS "expeditedProcessingAvailable",
  DROP COLUMN IF EXISTS notes;
DROP INDEX IF EXISTS idx_foia_statutes_state;
CREATE INDEX IF NOT EXISTS idx_foia_statutes_state ON foia_statutes (state_code);

-- ─── foia_agencies: back to snake ───
ALTER TABLE foia_agencies RENAME COLUMN "stateCode" TO state_code;
ALTER TABLE foia_agencies
  DROP COLUMN IF EXISTS "jurisdictionLevel",
  DROP COLUMN IF EXISTS "agencyName",
  DROP COLUMN IF EXISTS "agencyComponent",
  DROP COLUMN IF EXISTS "portalUrl",
  DROP COLUMN IF EXISTS "mailingAddress",
  DROP COLUMN IF EXISTS "submissionMethods",
  DROP COLUMN IF EXISTS notes;
DROP INDEX IF EXISTS idx_foia_agencies_state;
DROP INDEX IF EXISTS idx_foia_agencies_jurisdiction;
CREATE INDEX IF NOT EXISTS idx_foia_agencies_state ON foia_agencies (state_code);
CREATE INDEX IF NOT EXISTS idx_foia_agencies_jurisdiction ON foia_agencies (jurisdiction_level);

-- ─── routing tables, snake_case canonical ───
DROP TABLE IF EXISTS foia_agency_records;
DROP TABLE IF EXISTS foia_record_types;
DROP TYPE IF EXISTS foia_agency_records_confidence_enum;
DROP TYPE IF EXISTS foia_agencies_jurisdiction_level_enum;
DROP TYPE IF EXISTS foia_agencies_submission_methods_enum;

CREATE TABLE foia_record_types (
  id serial PRIMARY KEY,
  domain varchar(64) NOT NULL,
  record_type varchar(128) NOT NULL,
  record_description text NOT NULL,
  typical_keywords jsonb,
  retention_notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_foia_record_types_domain ON foia_record_types (domain);
CREATE UNIQUE INDEX idx_foia_record_types_unique ON foia_record_types (domain, record_type);

CREATE TABLE foia_agency_records (
  id serial PRIMARY KEY,
  agency_id integer NOT NULL REFERENCES foia_agencies(id),
  record_type_id integer NOT NULL REFERENCES foia_record_types(id),
  statute_id integer NOT NULL REFERENCES foia_statutes(id),
  confidence varchar(8) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_foia_agency_records_agency ON foia_agency_records (agency_id);
CREATE INDEX idx_foia_agency_records_record ON foia_agency_records (record_type_id);
CREATE INDEX idx_foia_agency_records_statute ON foia_agency_records (statute_id);
