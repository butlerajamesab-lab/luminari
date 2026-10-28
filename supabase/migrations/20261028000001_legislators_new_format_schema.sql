-- ============================================================
-- Legislators, new format: schema (first new-format tables)
-- ============================================================
-- This is the database-rebuild starting point Alexander directed
-- 2026-10-27: build alongside the old database, then transfer,
-- quarantine, then delete. These tables are NEW and sit beside
-- the old schema; they do not alter any existing table.
--
-- Deliberately NOT reused: public.legislator_contacts, seeded by
-- April migration 023 with district/switchboard numbers presented
-- as office numbers (the twin/switchboard failure mode). Its rows
-- are not carried into these tables.
--
-- Apply-time checks (the person applying must confirm):
--  1. No live public.legislators / public.legislator_committees /
--     public.tribal_leaders table with conflicting columns exists.
--     (This lane could not list live table columns; CREATE TABLE
--     IF NOT EXISTS protects against clobbering, but seed INSERTs
--     would fail on a column mismatch -- check first.)
--  2. Apply DDL before any seed file in this series.
--  3. These files are registered in
--     scripts/audit-supabase-migration-ledger-parity.py as approved
--     repository-only until a production application receipt exists.
--
-- Honesty labels carried in the data itself:
--  - federal phone/office/website are NULL until the Congress.gov
--    member-detail batch lands; cards must say so, never invent.
--  - state committee time_marker is a fetch-date label only
--    ("current (fetched 2026-10-27)"); per-state session labels
--    are a later refresh pass.
--  - tribal_leaders rows are BIA directory leaders, NOT council
--    rosters; status text is verbatim including its verify note.

CREATE TABLE IF NOT EXISTS public.legislators (
  member_key text PRIMARY KEY,
  level text NOT NULL,
  chamber text NOT NULL,
  state text NOT NULL,
  district text,
  full_name text NOT NULL,
  party text,
  status text NOT NULL DEFAULT 'current',
  representation text,
  phone text,
  email text,
  contact_method text,
  contact_note text,
  website_url text,
  office_address text,
  office_classification text,
  district_office_address text,
  district_phone text,
  photo_url text,
  bio_url text,
  bio_text text,
  bio_source text,
  links_json text,
  source text NOT NULL,
  source_url text,
  source_update text,
  fetched_date text,
  last_refreshed text,
  verification_status text
);
CREATE INDEX IF NOT EXISTS legislators_state_idx ON public.legislators (state);
CREATE INDEX IF NOT EXISTS legislators_status_idx ON public.legislators (status);

CREATE TABLE IF NOT EXISTS public.legislator_committees (
  id bigserial PRIMARY KEY,
  member_key text NOT NULL REFERENCES public.legislators (member_key),
  committee_name text NOT NULL,
  committee_code text,
  chamber text,
  subcommittee_name text NOT NULL DEFAULT '',
  role text,
  rank_no integer,
  time_marker text NOT NULL,
  time_kind text NOT NULL,
  source text,
  fetched_date text,
  UNIQUE (member_key, committee_name, subcommittee_name, time_marker)
);
CREATE INDEX IF NOT EXISTS legislator_committees_member_idx
  ON public.legislator_committees (member_key);

CREATE TABLE IF NOT EXISTS public.tribal_leaders (
  member_key text PRIMARY KEY,
  key_scheme text NOT NULL,
  level text NOT NULL DEFAULT 'tribal',
  record_kind text NOT NULL,
  tribe_full_name text NOT NULL,
  tribe_alternate_name text,
  tribe_short_name text,
  tribal_component text,
  tribal_component_name text,
  full_name text NOT NULL,
  title text,
  aka text,
  phone text,
  fax text,
  email text,
  website_url text,
  office_address text,
  mailing_address text,
  hq_state text,
  bia_region text,
  bia_agency text,
  date_elected text,
  next_election text,
  latitude double precision,
  longitude double precision,
  point_location text,
  notes text,
  status text NOT NULL,
  source text NOT NULL,
  fetched_date text,
  baseline_note text
);
CREATE INDEX IF NOT EXISTS tribal_leaders_hq_state_idx ON public.tribal_leaders (hq_state);
