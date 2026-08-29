
-- Drop existing tables and rebuild clean
DROP TABLE IF EXISTS engine_registry_v2 CASCADE;
DROP TABLE IF EXISTS engine_drift_warnings CASCADE;

-- Rename the original stub engine_registry (from initial migrations) if it exists
ALTER TABLE IF EXISTS engine_registry RENAME TO engine_registry_original_stub;

-- Create canonical engine registry v3
CREATE TABLE engine_registry_v3 (
  id                BIGSERIAL PRIMARY KEY,
  engine_name       VARCHAR(256) NOT NULL UNIQUE,
  file_path         TEXT NOT NULL,
  router_export     TEXT,
  approuter_key     VARCHAR(128),

  layer             VARCHAR(16) NOT NULL,
  family            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN (
    'fully_implemented','scaffolded','partial','unknown','broken'
  )),

  tables_used       TEXT[],
  llm_calls         TEXT,
  notes             TEXT NOT NULL,

  has_warning       BOOLEAN NOT NULL DEFAULT FALSE,
  warning_codes     TEXT[],
  confirmed_live    BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        BIGINT NOT NULL DEFAULT 0,
  updated_at        BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_er3_status  ON engine_registry_v3(status);
CREATE INDEX idx_er3_family  ON engine_registry_v3(family);
CREATE INDEX idx_er3_layer   ON engine_registry_v3(layer);
CREATE INDEX idx_er3_warning ON engine_registry_v3(has_warning);
CREATE INDEX idx_er3_live    ON engine_registry_v3(confirmed_live);

-- Integrity warnings (corrected)
CREATE TABLE engine_warnings (
  id              BIGSERIAL PRIMARY KEY,
  warning_code    VARCHAR(16) NOT NULL UNIQUE,
  severity        TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description     TEXT NOT NULL,
  fix             TEXT,
  affected_engines TEXT[],
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL DEFAULT 0
);

-- Canonical Drizzle schema table registry
CREATE TABLE schema_table_registry (
  id              BIGSERIAL PRIMARY KEY,
  table_name      VARCHAR(128) NOT NULL UNIQUE,
  table_group     TEXT NOT NULL CHECK (table_group IN ('core','cda','luminari_new')),
  confirmed       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT
);

