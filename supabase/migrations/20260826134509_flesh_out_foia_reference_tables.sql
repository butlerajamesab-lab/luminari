-- Flesh out the FOIA reference stubs (were id + state_code only, 0 rows).
-- Additive only: no existing columns altered or dropped. No RLS changes.

ALTER TABLE foia_statutes
  ADD COLUMN IF NOT EXISTS jurisdiction_level text,          -- 'federal' | 'state'
  ADD COLUMN IF NOT EXISTS statute_name text,                -- e.g. 'Freedom of Information Act'
  ADD COLUMN IF NOT EXISTS citation text,                    -- e.g. '5 U.S.C. § 552'
  ADD COLUMN IF NOT EXISTS response_days integer,            -- statutory response period
  ADD COLUMN IF NOT EXISTS response_days_unit text,          -- 'business_days' | 'calendar_days'
  ADD COLUMN IF NOT EXISTS extension_rule text,              -- e.g. '+10 business days for unusual circumstances'
  ADD COLUMN IF NOT EXISTS official_url text,                -- authoritative source link
  ADD COLUMN IF NOT EXISTS appeal_note text,                 -- administrative appeal window
  ADD COLUMN IF NOT EXISTS source_hash8 text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE foia_agencies
  ADD COLUMN IF NOT EXISTS agency_name text,
  ADD COLUMN IF NOT EXISTS agency_abbreviation text,
  ADD COLUMN IF NOT EXISTS component_name text,              -- foia.gov component, if any
  ADD COLUMN IF NOT EXISTS jurisdiction_level text,          -- 'federal' | 'state'
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS submission_portal text,           -- e.g. Palantir/foia.gov portal link
  ADD COLUMN IF NOT EXISTS reading_room text,
  ADD COLUMN IF NOT EXISTS source_ref text,                  -- provenance, e.g. 'api.foia.gov'
  ADD COLUMN IF NOT EXISTS source_hash8 text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
