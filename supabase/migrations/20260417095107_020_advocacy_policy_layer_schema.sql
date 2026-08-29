
-- ============================================================
-- MIGRATION 020: Advocacy & Policy Layer Schema
-- 11 policy domains, 3 geographic nodes → 7 planned
-- 312 orgs, 87 legislators, 156 agencies, 34 coalitions
-- ============================================================

-- Policy domains
CREATE TABLE policy_domains (
  id              BIGSERIAL PRIMARY KEY,
  domain_id       VARCHAR(64) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  description     TEXT NOT NULL,
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Advocacy organizations
CREATE TABLE advocacy_organizations (
  id              BIGSERIAL PRIMARY KEY,
  org_id          VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  website         VARCHAR(512),
  focus           TEXT NOT NULL,
  phone           VARCHAR(64),
  hq_location     VARCHAR(256),
  domain_ids      TEXT[],          -- which policy domains this org covers
  coalitions      TEXT[],          -- coalition names this org belongs to
  state_chapters  TEXT[],          -- states with chapters
  geographic_node VARCHAR(64),     -- 'seattle', 'denver', 'phoenix', etc.
  source          TEXT NOT NULL,
  is_government   BOOLEAN NOT NULL DEFAULT FALSE,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ao_domain  ON advocacy_organizations USING GIN(domain_ids);
CREATE INDEX idx_ao_node    ON advocacy_organizations(geographic_node);
CREATE INDEX idx_ao_coalitions ON advocacy_organizations USING GIN(coalitions);

-- Legislator contacts
CREATE TABLE legislator_contacts (
  id              BIGSERIAL PRIMARY KEY,
  legislator_id   VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  title           VARCHAR(256) NOT NULL,
  chamber         TEXT NOT NULL CHECK (chamber IN ('House','Senate','State House','State Senate','unknown')),
  level           TEXT NOT NULL CHECK (level IN ('federal','state','local')),
  state           VARCHAR(2) NOT NULL,
  district        VARCHAR(32),
  party           VARCHAR(32),
  phone           VARCHAR(64),
  email           VARCHAR(512),
  key_bills       TEXT[],
  domain_ids      TEXT[],
  geographic_node VARCHAR(64),
  source          TEXT NOT NULL,
  verified        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_lc_state   ON legislator_contacts(state);
CREATE INDEX idx_lc_chamber ON legislator_contacts(chamber);
CREATE INDEX idx_lc_domain  ON legislator_contacts USING GIN(domain_ids);

-- Government agencies (oversight + enforcement)
CREATE TABLE coalition_agencies (
  id              BIGSERIAL PRIMARY KEY,
  agency_id       VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  website         VARCHAR(512),
  jurisdiction    TEXT NOT NULL,   -- 'Federal', 'State (WA)', 'Municipal (Seattle)', etc.
  phone           VARCHAR(64),
  oversight_focus TEXT NOT NULL,
  domain_ids      TEXT[],
  geographic_focus VARCHAR(128),
  state           VARCHAR(2),
  source          TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ca_jurisdiction ON coalition_agencies(jurisdiction);
CREATE INDEX idx_ca_domain       ON coalition_agencies USING GIN(domain_ids);

-- Coalition networks
CREATE TABLE coalition_networks (
  id              BIGSERIAL PRIMARY KEY,
  coalition_id    VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  description     TEXT NOT NULL,
  member_org_names TEXT[],
  member_legislator_names TEXT[],
  focus_areas     TEXT[],         -- domain_ids
  priority        TEXT,
  source          TEXT NOT NULL,
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cn_focus ON coalition_networks USING GIN(focus_areas);

-- Advocacy targets
CREATE TABLE advocacy_targets (
  id              BIGSERIAL PRIMARY KEY,
  target_id       VARCHAR(128) NOT NULL UNIQUE,
  name            VARCHAR(512) NOT NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN ('regulatory_change','legislative','litigation','administrative','public_pressure')),
  jurisdiction    TEXT NOT NULL,
  current_status  TEXT NOT NULL,
  agency          TEXT,
  description     TEXT NOT NULL,
  legal_basis     TEXT,
  priority        TEXT NOT NULL CHECK (priority IN ('Critical','High','Medium','Low')),
  domain_ids      TEXT[],
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_at_priority ON advocacy_targets(priority);
CREATE INDEX idx_at_type     ON advocacy_targets(target_type);
CREATE INDEX idx_at_domain   ON advocacy_targets USING GIN(domain_ids);

-- Geographic nodes
CREATE TABLE geographic_nodes (
  id              BIGSERIAL PRIMARY KEY,
  node_id         VARCHAR(64) NOT NULL UNIQUE,
  city            VARCHAR(128) NOT NULL,
  state           VARCHAR(2),
  status          TEXT NOT NULL CHECK (status IN ('active','planned','inactive')),
  target_launch   VARCHAR(32),
  rationale       TEXT,
  regional_org_names TEXT[],
  regional_legislator_names TEXT[],
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Unified Output Layer source storage
CREATE TABLE unified_output_layer_source (
  id              BIGSERIAL PRIMARY KEY,
  file_name       VARCHAR(256) NOT NULL UNIQUE,
  file_type       VARCHAR(32) NOT NULL,
  content         TEXT NOT NULL,
  line_count      INT,
  status          TEXT NOT NULL DEFAULT 'production_ready' CHECK (status IN ('production_ready','draft','deprecated')),
  flagged_assumptions TEXT[],
  session_id      VARCHAR(64),
  created_at      BIGINT NOT NULL DEFAULT 0
);
