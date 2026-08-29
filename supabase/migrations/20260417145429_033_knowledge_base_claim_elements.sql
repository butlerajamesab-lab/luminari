
-- ============================================================
-- MIGRATION 033: Claim Elements Matrix + Statutes Layer
-- From inline JSON in this session
-- L3 — Element-by-element proof requirements per claim type
-- ============================================================

CREATE TABLE claim_elements_matrix (
  id                  BIGSERIAL PRIMARY KEY,
  element_id          VARCHAR(32) NOT NULL UNIQUE,
  claim_type          VARCHAR(128) NOT NULL,
  domain              VARCHAR(64) NOT NULL,
  statute             VARCHAR(512),
  element_name        VARCHAR(256) NOT NULL,
  description         TEXT NOT NULL,
  evidence_types      TEXT[] NOT NULL,
  confidence_threshold DECIMAL(4,3) NOT NULL,
  proof_standard      TEXT NOT NULL,
  evidence_examples   TEXT[],
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cem_claim_type ON claim_elements_matrix(claim_type);
CREATE INDEX idx_cem_domain     ON claim_elements_matrix(domain);

-- Win probability + timeline per claim type
CREATE TABLE claim_type_metadata (
  id                  BIGSERIAL PRIMARY KEY,
  claim_type          VARCHAR(128) NOT NULL UNIQUE,
  domain              VARCHAR(64) NOT NULL,
  statute             VARCHAR(512),
  win_probability     DECIMAL(4,3),
  avg_timeline_months INT,
  appeal_pathway      TEXT,
  enforcement_pathways TEXT[],
  state_variation     TEXT,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ctm_domain ON claim_type_metadata(domain);

-- Statutes layer (L1) — expanded from inline JSON
CREATE TABLE statutes_registry (
  id                  BIGSERIAL PRIMARY KEY,
  statute_id          VARCHAR(64) NOT NULL UNIQUE,
  statute_number      VARCHAR(256) NOT NULL,
  statute_title       VARCHAR(512) NOT NULL,
  domain              VARCHAR(64) NOT NULL,
  jurisdiction        VARCHAR(32) NOT NULL DEFAULT 'federal',
  state               VARCHAR(4),
  enacted             TEXT,
  enforcement_agency  TEXT,
  application_scope   TEXT,
  key_clauses         JSONB,
  claim_types_covered TEXT[],
  statute_of_limitations TEXT,
  state_variation     TEXT,
  website             TEXT,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_sr_domain      ON statutes_registry(domain);
CREATE INDEX idx_sr_jurisdiction ON statutes_registry(jurisdiction);
CREATE INDEX idx_sr_statute_number ON statutes_registry(statute_number);

-- Filing templates (L7/L9) — from inline JSON
CREATE TABLE filing_templates_registry (
  id                  BIGSERIAL PRIMARY KEY,
  template_id         VARCHAR(64) NOT NULL UNIQUE,
  claim_type          VARCHAR(128) NOT NULL,
  statutory_authority TEXT,
  jurisdiction_scope  TEXT NOT NULL,
  form_required       TEXT,
  document_structure  JSONB NOT NULL,
  filing_instructions JSONB NOT NULL,
  supporting_docs     TEXT[],
  jurisdiction_variations JSONB,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ftr_claim_type   ON filing_templates_registry(claim_type);

-- Coalition intelligence (reform pipeline)
CREATE TABLE reform_legislators (
  id                  BIGSERIAL PRIMARY KEY,
  legislator_id       VARCHAR(64) NOT NULL UNIQUE,
  name                VARCHAR(256) NOT NULL,
  party               VARCHAR(8),
  state               VARCHAR(4) NOT NULL,
  chamber             TEXT NOT NULL,
  committees          TEXT[],
  jurisdiction_focus  TEXT,
  recent_bills        TEXT[],
  advocacy_stance     TEXT,
  contact_office      TEXT,
  reform_leverage     TEXT,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE reform_campaigns (
  id                  BIGSERIAL PRIMARY KEY,
  campaign_id         VARCHAR(64) NOT NULL UNIQUE,
  campaign_name       VARCHAR(512) NOT NULL,
  status_stage        TEXT NOT NULL,
  primary_sponsor     TEXT,
  coalition_leads     TEXT[],
  demand              TEXT NOT NULL,
  legislative_vehicle TEXT,
  target_passage      TEXT,
  stage_timeline      JSONB,
  supporting_evidence TEXT[],
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE reform_media_outlets (
  id                  BIGSERIAL PRIMARY KEY,
  outlet_id           VARCHAR(64) NOT NULL UNIQUE,
  outlet_name         VARCHAR(256) NOT NULL,
  outlet_type         TEXT,
  coverage            TEXT,
  audience            TEXT,
  contact             TEXT,
  partnership_potential TEXT,
  scope               TEXT,
  created_at          BIGINT NOT NULL DEFAULT 0
);
