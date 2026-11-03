-- ============================================================
-- VA Facilities, new format: schema (DRAFT — NOT APPLIED)
-- ============================================================
-- Drafted 2026-10-30 in the conventions of the legislators
-- new-format schema (20261028000001). Alexander's direction:
-- build the VA interface the way the legislator slate was built —
-- dataset first, new tables beside the old schema, provenance on
-- every row, scoped reads only.
--
-- These tables are NEW and sit beside the existing schema. They do
-- not alter any existing table. Deliberately NOT reused:
-- public.sais_resources — legacy reference data (649 rows, 9 of
-- them SAIS-VA pathways). Its rows are not carried into these
-- tables; it stays reference-only per the 2026-10-29 organization
-- record.
--
-- Apply-time checks (the person applying must confirm):
--  1. No live public.va_facilities / public.va_facility_services
--     table with conflicting columns exists. CREATE TABLE IF NOT
--     EXISTS protects against clobbering, but seed INSERTs would
--     fail on a column mismatch — check first.
--  2. Apply DDL before any seed file in this series.
--  3. Register this file as approved repository-only until a
--     production application receipt exists (the #756/#757
--     discipline: repository-only first, production receipt after
--     verified application, with per-file md5s).
--  4. Application is a gated step in the database reset and needs
--     Alexander's separate approval. This draft authorizes nothing.
--
-- Honesty labels carried in the data itself:
--  - The first baseline is the SANDBOX pull (2026-10-30, 2,591
--    records). Sandbox data is not guaranteed up-to-date, so rows
--    seeded from it carry verification_status 'DIRECTORY'. The
--    production pull re-stages them; status changes only with a
--    supersession receipt.
--  - VA's own docs warn that mobile-facility latitude/longitude
--    and address may be inaccurate. is_mobile is carried on the
--    row so the map and the card can say so.
--  - operating_status is the VA's code, verbatim (NORMAL, LIMITED,
--    NOTICE, TEMPORARY_CLOSURE, TEMPORARY_LOCATION, VIRTUAL_CARE,
--    COMING_SOON, CLOSED). It is never translated into a verdict.
--  - Absent values stay NULL. Cards render labeled gaps
--    ("Not listed"), never invented values.

CREATE TABLE IF NOT EXISTS public.va_facilities (
  facility_key text PRIMARY KEY,          -- VA facility id, e.g. vha_402GA
  name text NOT NULL,
  facility_type text NOT NULL,            -- va_health_facility | va_benefits_facility | va_cemetery | vet_center
  classification text,                    -- VA classification, verbatim
  operating_status text NOT NULL,         -- VA code, verbatim
  operating_status_detail text,
  timezone text,
  phone_main text,
  phone_json text,                        -- full phone block as supplied
  website_url text,
  physical_address1 text,
  physical_address2 text,
  physical_address3 text,
  physical_city text,
  physical_state text,
  physical_zip text,
  mailing_address1 text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  latitude double precision,              -- source-supplied only
  longitude double precision,             -- source-supplied only
  is_mobile boolean NOT NULL DEFAULT false,
  hours_json text,                        -- hours block as supplied
  source text NOT NULL,                   -- 'VA Facilities API v1'
  source_url text,
  source_env text NOT NULL,               -- 'sandbox' | 'production'
  fetched_date text,
  verification_status text NOT NULL DEFAULT 'DIRECTORY',
  hold_flag boolean NOT NULL DEFAULT false,
  hold_reason text
);
CREATE INDEX IF NOT EXISTS va_facilities_state_idx ON public.va_facilities (physical_state);
CREATE INDEX IF NOT EXISTS va_facilities_type_idx ON public.va_facilities (facility_type);
CREATE INDEX IF NOT EXISTS va_facilities_status_idx ON public.va_facilities (operating_status);

CREATE TABLE IF NOT EXISTS public.va_facility_services (
  id bigserial PRIMARY KEY,
  facility_key text NOT NULL REFERENCES public.va_facilities (facility_key),
  service_id text NOT NULL,               -- VA serviceId, e.g. applyingForBenefits
  service_name text NOT NULL,
  service_link text,
  source text,
  fetched_date text,
  UNIQUE (facility_key, service_id)
);
CREATE INDEX IF NOT EXISTS va_facility_services_facility_idx
  ON public.va_facility_services (facility_key);
