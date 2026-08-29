
-- ============================================================
-- MIGRATION 032: Full Engine Inventory (107 engines from JSON)
-- + Manus Drizzle Schema registry (366 tables confirmed)
-- ============================================================

-- Engine inventory table from actual codebase scan
CREATE TABLE engine_inventory_full (
  id              BIGSERIAL PRIMARY KEY,
  engine_id       VARCHAR(128) NOT NULL UNIQUE,
  engine_name     VARCHAR(256) NOT NULL,
  family          VARCHAR(64) NOT NULL,
  layer           VARCHAR(64),
  purpose         TEXT,
  sql_tables      TEXT,         -- comma-separated table names this engine reads/writes
  procedures      TEXT,         -- tRPC procedure names
  file_path       VARCHAR(512) NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('fully_implemented','partially_implemented','specification_complete','claude_generated','built_in_codebase','unknown')),
  line_count      INT DEFAULT 0,
  created_at      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_eif_family  ON engine_inventory_full(family);
CREATE INDEX idx_eif_status  ON engine_inventory_full(status);

-- Manus Drizzle schema table registry (366 tables from schema.ts)
CREATE TABLE manus_schema_registry (
  id              BIGSERIAL PRIMARY KEY,
  table_name      VARCHAR(256) NOT NULL UNIQUE,
  source          TEXT NOT NULL DEFAULT 'drizzle_schema_ts',
  confirmed_at    VARCHAR(32) NOT NULL DEFAULT '2026-04-17',
  notes           TEXT,
  created_at      BIGINT NOT NULL DEFAULT 0
);
