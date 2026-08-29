
-- ============================================================
-- LUMINARI — MIGRATION 003
-- Knowledge Backbone: What the system knows about the law
-- ============================================================

CREATE TABLE legal_statutes (
  id              BIGSERIAL PRIMARY KEY,
  statute_key     VARCHAR(64) NOT NULL UNIQUE,
  title           VARCHAR(512) NOT NULL,
  citation        VARCHAR(256) NOT NULL,
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('federal','state','federal_state','tribal')),
  state_code      VARCHAR(2),
  domain          VARCHAR(128) NOT NULL,
  summary         TEXT,
  sol_days        INT,
  sol_notes       TEXT,
  rcw_citations   JSONB,
  statutes_linked JSONB,
  agency_enforcer VARCHAR(256),
  source_url      VARCHAR(512),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_statutes_domain      ON legal_statutes(domain);
CREATE INDEX idx_statutes_jurisdiction ON legal_statutes(jurisdiction);
CREATE INDEX idx_statutes_state       ON legal_statutes(state_code);

CREATE TABLE agencies (
  id              BIGSERIAL PRIMARY KEY,
  agency_key      VARCHAR(64) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  short_name      VARCHAR(64),
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('federal','state','county','city','tribal','federal_tribal')),
  state_code      VARCHAR(2),
  category        VARCHAR(128) NOT NULL,
  intake_method   TEXT,
  sol_notes       TEXT,
  rcw_citations   JSONB,
  claims_linked   JSONB,
  url             VARCHAR(512),
  phone           VARCHAR(64),
  address         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_agencies_jurisdiction ON agencies(jurisdiction);
CREATE INDEX idx_agencies_state        ON agencies(state_code);
CREATE INDEX idx_agencies_category     ON agencies(category);

CREATE TABLE claims_registry (
  id              BIGSERIAL PRIMARY KEY,
  claim_id        VARCHAR(16) NOT NULL UNIQUE,
  category        VARCHAR(128) NOT NULL,
  jurisdiction    TEXT NOT NULL CHECK (jurisdiction IN ('federal','state','federal_state','federal_tribal','state_local','state_tribal')),
  state_code      VARCHAR(2),
  statutes        JSONB NOT NULL,
  burden          VARCHAR(64),
  elements_of_proof JSONB NOT NULL,
  common_defenses JSONB,
  evidence_types  JSONB,
  key_barriers    JSONB,
  linked_agencies JSONB NOT NULL,
  sol_days        INT,
  sol_notes       TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_claims_category     ON claims_registry(category);
CREATE INDEX idx_claims_jurisdiction ON claims_registry(jurisdiction);

CREATE TABLE proof_frameworks (
  id              BIGSERIAL PRIMARY KEY,
  framework_id    VARCHAR(16) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  applies_to_claims JSONB NOT NULL,
  description     TEXT NOT NULL,
  elements        JSONB NOT NULL,
  strength        TEXT,
  weakness        TEXT,
  key_authority   JSONB NOT NULL,
  state_code      VARCHAR(2),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE litigation_barriers (
  id                   BIGSERIAL PRIMARY KEY,
  barrier_id           VARCHAR(16) NOT NULL UNIQUE,
  name                 VARCHAR(256) NOT NULL,
  category             VARCHAR(128) NOT NULL,
  description          TEXT NOT NULL,
  key_authority        JSONB,
  what_it_blocks       TEXT,
  possible_workarounds JSONB,
  linked_doctrine      JSONB,
  state_code           VARCHAR(2),
  created_at           BIGINT NOT NULL DEFAULT 0,
  updated_at           BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE signals_registry (
  id                   BIGSERIAL PRIMARY KEY,
  signal_id            VARCHAR(16) NOT NULL UNIQUE,
  name                 VARCHAR(256) NOT NULL,
  trigger_pattern      TEXT NOT NULL,
  linked_barriers      JSONB,
  linked_doctrine      JSONB,
  explanation          TEXT NOT NULL,
  investigation_steps  JSONB NOT NULL,
  state_code           VARCHAR(2),
  created_at           BIGINT NOT NULL DEFAULT 0,
  updated_at           BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE doctrine_registry (
  id              BIGSERIAL PRIMARY KEY,
  doctrine_key    VARCHAR(64) NOT NULL UNIQUE,
  name            VARCHAR(256) NOT NULL,
  description     TEXT NOT NULL,
  primary_cases   JSONB,
  domains         JSONB,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

