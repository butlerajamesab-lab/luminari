
-- ============================================================
-- LUMINARI — MIGRATION 004
-- Evidence, Patterns, Actions, Outcomes
-- ============================================================

-- Documents uploaded to a case
CREATE TABLE documents (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  filename        VARCHAR(512) NOT NULL,
  file_type       VARCHAR(32) NOT NULL,
  mime_type       VARCHAR(128) NOT NULL,
  file_size       INT NOT NULL,
  storage_path    VARCHAR(512) NOT NULL,
  sha256_hash     VARCHAR(64) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','extracting','ready','error')),
  text_content    TEXT,
  page_count      INT,
  document_type   VARCHAR(128),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_docs_case   ON documents(case_id);
CREATE INDEX idx_docs_status ON documents(status);

-- Exact text excerpts — the evidence spine
CREATE TABLE quotes (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  document_id     BIGINT NOT NULL REFERENCES documents(id),
  quote_text      TEXT NOT NULL,
  page_number     INT,
  context         TEXT,
  statement_origin TEXT NOT NULL DEFAULT 'unknown' CHECK (statement_origin IN (
    'sworn_testimony','court_filing','discovery_disclosure',
    'media_report','internal_memo','informal_communication','unknown'
  )),
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_quotes_case ON quotes(case_id);
CREATE INDEX idx_quotes_doc  ON quotes(document_id);

-- Claims extracted from documents
CREATE TABLE claims (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  document_id     BIGINT NOT NULL REFERENCES documents(id),
  quote_id        BIGINT REFERENCES quotes(id),
  claim_text      TEXT NOT NULL,
  claim_type      VARCHAR(64) NOT NULL,
  date_referenced VARCHAR(64),
  entities_involved JSONB,
  evidentiary_weight TEXT NOT NULL DEFAULT 'signal_only' CHECK (evidentiary_weight IN ('finding_eligible','signal_only')),
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_claims_case   ON claims(case_id);
CREATE INDEX idx_claims_type   ON claims(claim_type);
CREATE INDEX idx_claims_weight ON claims(evidentiary_weight);

-- Findings — patterns across multiple claims
CREATE TABLE findings (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  finding_type    VARCHAR(64) NOT NULL,
  title           VARCHAR(512) NOT NULL,
  description     TEXT NOT NULL,
  significance    TEXT,
  claim_ids       JSONB NOT NULL DEFAULT '[]',
  confidence      TEXT NOT NULL DEFAULT 'preliminary' CHECK (confidence IN ('strong','moderate','preliminary')),
  evidentiary_weight TEXT NOT NULL DEFAULT 'note_signal' CHECK (evidentiary_weight IN ('finding','note_signal')),
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_findings_case ON findings(case_id);
CREATE INDEX idx_findings_type ON findings(finding_type);

-- Missing records — gaps the system detected
CREATE TABLE missing_records (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  domain          VARCHAR(64) NOT NULL,
  record_type     VARCHAR(128) NOT NULL,
  label           VARCHAR(256) NOT NULL,
  description     TEXT NOT NULL,
  legal_basis     TEXT,
  severity        TEXT NOT NULL CHECK (severity IN ('critical','important','helpful')),
  foia_eligible   BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','acknowledged','requested','received','not_applicable')),
  detected_at     BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_missing_case     ON missing_records(case_id);
CREATE INDEX idx_missing_severity ON missing_records(severity);

-- Case actions — next steps, deadlines, escalations
CREATE TABLE case_actions (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  action_type     VARCHAR(64) NOT NULL,
  title           VARCHAR(512) NOT NULL,
  description     TEXT,
  agency_key      VARCHAR(64),
  agency_name     VARCHAR(256),
  agency_url      VARCHAR(512),
  agency_phone    VARCHAR(64),
  deadline_date   BIGINT,
  deadline_rule   TEXT,
  is_deadline_strict BOOLEAN NOT NULL DEFAULT FALSE,
  documents_needed JSONB,
  linked_tool_href VARCHAR(256),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped','blocked')),
  completed_at    BIGINT,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_actions_case     ON case_actions(case_id);
CREATE INDEX idx_actions_status   ON case_actions(status);
CREATE INDEX idx_actions_deadline ON case_actions(deadline_date);

-- Patterns — cross-case systemic signals
CREATE TABLE patterns (
  id              BIGSERIAL PRIMARY KEY,
  pattern_key     VARCHAR(64) NOT NULL UNIQUE,
  pattern_type    VARCHAR(128) NOT NULL,
  name            VARCHAR(256) NOT NULL,
  description     TEXT NOT NULL,
  entity_name     VARCHAR(512),
  claim_type      VARCHAR(128),
  jurisdiction    VARCHAR(128),
  domain          VARCHAR(128),
  case_count      INT NOT NULL DEFAULT 0,
  signal_count    INT NOT NULL DEFAULT 0,
  confidence_score DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  status          TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','confirmed','dormant','archived')),
  first_seen_at   BIGINT,
  last_seen_at    BIGINT,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_patterns_type   ON patterns(pattern_type);
CREATE INDEX idx_patterns_status ON patterns(status);
CREATE INDEX idx_patterns_entity ON patterns(entity_name);

-- Outcomes — what actually happened
CREATE TABLE outcomes (
  id              BIGSERIAL PRIMARY KEY,
  case_id         BIGINT NOT NULL REFERENCES cases(id),
  outcome_type    TEXT NOT NULL CHECK (outcome_type IN (
    'resolved_favorable','resolved_unfavorable','settled',
    'referred','abandoned','ongoing','escalated'
  )),
  summary         TEXT,
  financial_recovery DECIMAL(12,2),
  programs_connected JSONB,
  actions_taken   JSONB,
  barriers_hit    JSONB,
  gaps_logged     JSONB,
  resolved_at     BIGINT,
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_outcomes_case ON outcomes(case_id);
CREATE INDEX idx_outcomes_type ON outcomes(outcome_type);

