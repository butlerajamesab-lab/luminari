CREATE TABLE IF NOT EXISTS locator_sources (
  source_id text PRIMARY KEY,
  agency_key text NOT NULL,
  tier int NOT NULL CHECK (tier IN (1,2,3)),
  endpoint_url text NOT NULL,
  endpoint_type text NOT NULL,
  auth text NOT NULL DEFAULT 'none',
  license text,
  coverage_claim text,
  coverage_verified boolean NOT NULL DEFAULT false,
  update_cadence text,
  last_fetched_at timestamptz,
  last_hash8 text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov_offices (
  office_id text PRIMARY KEY,
  agency_key text NOT NULL,
  office_name text NOT NULL,
  office_type text,
  state text,
  county text,
  city text,
  address_full text,
  phone_raw text,
  hours text,
  email text,
  url text,
  lat numeric,
  lng numeric,
  source_id text REFERENCES locator_sources(source_id),
  source_hash8 text,
  superseded_by text,
  provenance text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_office_xwalk (
  resource_id text NOT NULL,
  office_id text NOT NULL REFERENCES gov_offices(office_id),
  link_basis text NOT NULL DEFAULT 'locator_fill',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, office_id)
);

CREATE INDEX IF NOT EXISTS idx_gov_offices_agency_state ON gov_offices(agency_key, state);
