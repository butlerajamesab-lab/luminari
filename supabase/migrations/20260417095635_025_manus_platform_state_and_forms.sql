
-- ============================================================
-- MIGRATION 025: Manus Platform State + Forms Gap + Loop Spec
-- Operational intelligence from live Manus platform
-- ============================================================

-- Live platform state snapshot
CREATE TABLE manus_platform_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  snapshot_date   VARCHAR(32) NOT NULL,
  platform_url    VARCHAR(256),
  
  -- Codebase stats
  table_count     INT,
  row_count_approx BIGINT,
  trpc_routers    INT,
  page_components INT,
  test_files      INT,
  engine_stages   INT,
  
  -- Data state
  knowledge_backbone_records INT,
  total_cases     INT,
  total_documents INT,
  total_findings  INT,
  total_signals   INT,
  strong_signals  INT,
  moderate_signals INT,
  preliminary_signals INT,
  governed_signals INT,
  
  -- Notes
  notes           TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Data stream registry (from Manus)
CREATE TABLE manus_stream_registry (
  id              BIGSERIAL PRIMARY KEY,
  stream_id       VARCHAR(128) NOT NULL UNIQUE,
  stream_name     VARCHAR(256) NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('healthy','patched_needs_verify','needs_patching','disabled','unknown')),
  source_type     TEXT,          -- 'socrata', 'rest', etc.
  current_url     TEXT,
  old_url         TEXT,
  parser_mode     VARCHAR(32),
  auth_required   BOOLEAN DEFAULT FALSE,
  auth_notes      TEXT,
  run_confirmed   BOOLEAN DEFAULT FALSE,
  action_needed   TEXT,
  notes           TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Forms gap registry — what forms are missing per workflow
CREATE TABLE forms_gap_registry (
  id              BIGSERIAL PRIMARY KEY,
  workflow_id     VARCHAR(64) NOT NULL,
  jurisdiction    VARCHAR(128) NOT NULL,
  form_category   TEXT NOT NULL,
  required        BOOLEAN NOT NULL DEFAULT TRUE,
  critical        BOOLEAN NOT NULL DEFAULT TRUE,
  description     TEXT NOT NULL,
  expected_agency TEXT,
  expected_form_id VARCHAR(128),
  filing_format   TEXT,
  typical_deadline TEXT,
  statute_reference TEXT,
  status          TEXT NOT NULL DEFAULT 'NOT_FOUND' CHECK (status IN ('NOT_FOUND','FOUND','MAPPED','VERIFIED')),
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_fgr_workflow ON forms_gap_registry(workflow_id);
CREATE INDEX idx_fgr_status   ON forms_gap_registry(status);

-- Core feedback loop specification
CREATE TABLE feedback_loop_spec (
  id              BIGSERIAL PRIMARY KEY,
  spec_id         VARCHAR(64) NOT NULL UNIQUE,
  description     TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('not_implemented','in_progress','implemented','validated')),
  
  -- The loop steps as JSONB
  steps           JSONB NOT NULL,
  
  -- Test case
  test_pattern_id VARCHAR(32),
  test_jurisdiction VARCHAR(8),
  test_claim_type VARCHAR(64),
  validation_criteria TEXT[],
  
  -- System state it enables
  before_state    TEXT,
  after_state     TEXT,
  
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Knowledge documents produced (14 docx files)
CREATE TABLE knowledge_documents_produced (
  id              BIGSERIAL PRIMARY KEY,
  filename        VARCHAR(256) NOT NULL UNIQUE,
  coverage        TEXT NOT NULL,
  record_count    INT,
  contents        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'produced' CHECK (status IN ('produced','ingested','verified')),
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Sunam control protocol — operational rules
CREATE TABLE sunam_control_protocol (
  id              BIGSERIAL PRIMARY KEY,
  rule_type       TEXT NOT NULL CHECK (rule_type IN ('core_rule','drift_behavior','known_blocker','pre_mutation_rule','template')),
  description     TEXT NOT NULL,
  example         TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);

