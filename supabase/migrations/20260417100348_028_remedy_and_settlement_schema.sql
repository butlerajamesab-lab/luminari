
-- ============================================================
-- MIGRATION 028: Remedy & Settlement Module
-- From ARTIFACT 2 SQL Manifest — new tables not yet in DB
-- ============================================================

-- Damages matrix — jurisdiction × claim type × harm category
CREATE TABLE damages_matrix (
  id              BIGSERIAL PRIMARY KEY,
  damages_id      VARCHAR(128) NOT NULL UNIQUE,
  claim_type      VARCHAR(100) NOT NULL,
  jurisdiction    VARCHAR(100) NOT NULL,
  harm_category   VARCHAR(100) NOT NULL,
  low_award       DECIMAL(12,2),
  mid_award       DECIMAL(12,2),
  high_award      DECIMAL(12,2),
  case_citation   VARCHAR(500),
  notes           TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_dm_claim_type   ON damages_matrix(claim_type);
CREATE INDEX idx_dm_jurisdiction ON damages_matrix(jurisdiction);

-- Escalation targets — agency filing routes by domain + jurisdiction
CREATE TABLE escalation_targets (
  id                  BIGSERIAL PRIMARY KEY,
  target_id           VARCHAR(128) NOT NULL UNIQUE,
  jurisdiction        VARCHAR(100) NOT NULL,
  domain              VARCHAR(100) NOT NULL,
  agency_name         VARCHAR(256) NOT NULL,
  contact_email       VARCHAR(256),
  contact_phone       VARCHAR(32),
  filing_url          TEXT,
  processing_timeline VARCHAR(100),
  success_rate        DECIMAL(4,3),
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_et_jurisdiction_domain ON escalation_targets(jurisdiction, domain);

-- Remedy templates — demand letters, complaint forms, pleadings
CREATE TABLE remedy_templates (
  id                  BIGSERIAL PRIMARY KEY,
  template_id         VARCHAR(128) NOT NULL UNIQUE,
  template_name       VARCHAR(500) NOT NULL,
  template_type       VARCHAR(100) NOT NULL,  -- demand_letter, complaint, appeal, etc.
  claim_type          VARCHAR(100) NOT NULL,
  jurisdiction        VARCHAR(100) NOT NULL,
  template_body       TEXT NOT NULL,
  placeholder_fields  JSONB,
  governing_law       JSONB,
  success_rate        DECIMAL(4,3),
  average_settlement  DECIMAL(12,2),
  version             INT NOT NULL DEFAULT 1,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_rt_jurisdiction ON remedy_templates(jurisdiction);
CREATE INDEX idx_rt_claim_type   ON remedy_templates(claim_type);
CREATE INDEX idx_rt_type         ON remedy_templates(template_type);

-- Settlement calculations — formula registry
CREATE TABLE settlement_calculations (
  id              BIGSERIAL PRIMARY KEY,
  calculation_id  VARCHAR(128) NOT NULL UNIQUE,
  claim_type      VARCHAR(100) NOT NULL,
  jurisdiction    VARCHAR(100) NOT NULL,
  base_damages    DECIMAL(12,2),
  multiplier      DECIMAL(6,3),
  calculated_amount DECIMAL(12,2),
  formula_applied VARCHAR(500),
  case_law_support VARCHAR(500),
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_sc_jurisdiction ON settlement_calculations(jurisdiction);
CREATE INDEX idx_sc_claim_type   ON settlement_calculations(claim_type);

-- Contradiction matrix — cross-finding contradictions per case
CREATE TABLE contradiction_matrix (
  id                  BIGSERIAL PRIMARY KEY,
  case_id             BIGINT REFERENCES cases(id),
  finding_1_id        BIGINT REFERENCES findings(id),
  finding_2_id        BIGINT REFERENCES findings(id),
  contradiction_type  VARCHAR(100),
  description         TEXT,
  severity            VARCHAR(50),
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_cm_case ON contradiction_matrix(case_id);

-- Pattern history — trend tracking per pattern
CREATE TABLE pattern_history (
  id              BIGSERIAL PRIMARY KEY,
  pattern_id      BIGINT NOT NULL REFERENCES patterns(id),
  time_period     VARCHAR(50) NOT NULL,
  occurrence_count INT NOT NULL DEFAULT 0,
  trend           VARCHAR(50),   -- rising, falling, stable
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ph_pattern ON pattern_history(pattern_id);

-- Workflows — procedural step registry (81 total planned)
CREATE TABLE workflows (
  id                  BIGSERIAL PRIMARY KEY,
  workflow_id         VARCHAR(128) NOT NULL UNIQUE,
  workflow_name       VARCHAR(256) NOT NULL,
  claim_type          VARCHAR(100),
  jurisdiction        VARCHAR(100),
  domain              VARCHAR(100),
  steps               JSONB,
  estimated_timeline  VARCHAR(100),
  success_rate        DECIMAL(4,3),
  created_at          BIGINT NOT NULL DEFAULT 0,
  updated_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_wf_claim_type   ON workflows(claim_type);
CREATE INDEX idx_wf_jurisdiction ON workflows(jurisdiction);
CREATE INDEX idx_wf_domain       ON workflows(domain);

-- Legal cases — case law registry (357 entries planned)
CREATE TABLE legal_cases (
  id                  BIGSERIAL PRIMARY KEY,
  case_ref            VARCHAR(128) NOT NULL UNIQUE,
  case_name           VARCHAR(500) NOT NULL,
  citation            VARCHAR(256),
  jurisdiction        VARCHAR(100),
  court               VARCHAR(256),
  year_decided        INT,
  holding             TEXT,
  key_quotes          JSONB,
  statutes_interpreted JSONB,
  domains             JSONB,
  source_url          TEXT,
  created_at          BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_lc_jurisdiction ON legal_cases(jurisdiction);
CREATE INDEX idx_lc_citation     ON legal_cases(citation);

