
-- ============================================================
-- LUMINARI — MIGRATION 014
-- Engine Registry — Authoritative source of truth
-- Every engine, every layer, every status, every warning
-- Built from exhaustive extraction across all project files
-- ============================================================

CREATE TABLE engine_registry_v2 (
  id              BIGSERIAL PRIMARY KEY,
  engine_name     VARCHAR(256) NOT NULL UNIQUE,
  file_path       TEXT NOT NULL,
  router_export   TEXT,                    -- null if not a router
  approuter_key   VARCHAR(128),            -- key in appRouter object
  
  -- Classification
  layer           TEXT NOT NULL,           -- L0, L1, L2...L11, L0-L9 etc
  family          TEXT NOT NULL CHECK (family IN (
    'Intake',
    'Ingestion',
    'Extraction / Evidence',
    'Validation / Normalization',
    'Evidence',
    'Pattern / Signal',
    'Interpretation',
    'Procedural / Action',
    'Export / Assembly',
    'Oversight / Control',
    'Oversight / Intelligence',
    'Oversight / Public',
    'Sovereign Control',
    'Control',
    'Control / Validation',
    'Parsing / Evidence / Intelligence',
    'Ingestion / Extraction / Evidence',
    'Evidence / Intelligence',
    'Control / Oversight',
    'Admin / Oversight',
    'unknown'
  )),
  
  -- Status
  status          TEXT NOT NULL CHECK (status IN (
    'fully_implemented',
    'scaffolded',
    'partial',
    'unknown',
    'broken'
  )),
  
  -- Tables
  tables_used     TEXT[],                  -- list of table names
  
  -- LLM usage
  llm_calls       TEXT,                    -- 'none (deterministic)', '1 per doc', etc
  
  -- Key notes
  notes           TEXT NOT NULL,
  
  -- Warnings
  has_warning     BOOLEAN NOT NULL DEFAULT FALSE,
  warning_codes   TEXT[],                  -- e.g. ['WARNING-02','WARNING-05']
  
  -- Registry meta
  confirmed_live  BOOLEAN NOT NULL DEFAULT FALSE,
  source_files    TEXT[],                  -- which project files confirmed this
  
  created_at      BIGINT NOT NULL DEFAULT 0,
  updated_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_er_status  ON engine_registry_v2(status);
CREATE INDEX idx_er_family  ON engine_registry_v2(family);
CREATE INDEX idx_er_layer   ON engine_registry_v2(layer);
CREATE INDEX idx_er_warning ON engine_registry_v2(has_warning);

-- Drift / Integrity warnings table
CREATE TABLE engine_drift_warnings (
  id              BIGSERIAL PRIMARY KEY,
  warning_code    VARCHAR(16) NOT NULL UNIQUE,
  severity        TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description     TEXT NOT NULL,
  fix             TEXT,
  affected_engines TEXT[],
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT 0
);
