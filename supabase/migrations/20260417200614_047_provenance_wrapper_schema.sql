
-- ============================================================
-- MIGRATION 047: PROVENANCE WRAPPER SCHEMA
-- Central provenance table. Every row in every table gets a
-- provenance_id FK pointing here. One pass. Done right. Never revisited.
--
-- What we CAN assign now:
--   source, layer, family, status, populated_at
--
-- What stays NULL until full engine registry (359 engines) is loaded:
--   engine_id, ui_surface
-- ============================================================

CREATE TABLE IF NOT EXISTS provenance (
  id              BIGSERIAL PRIMARY KEY,

  -- WHERE IT CAME FROM
  source_file     TEXT,         -- filename: 'wa-resources__1_.json'
  source_thread   TEXT,         -- thread ID or title
  source_migration VARCHAR(128), -- migration name that loaded it
  populated_by    TEXT NOT NULL
    CHECK (populated_by IN (
      'claude_migration',    -- loaded by Claude in this rebuild
      'manus_extraction',    -- extracted from Manus codebase/DB
      'team_research',       -- submitted by research team
      'system_seed',         -- canonical system seed data
      'external_verified'    -- verified external source (gov website, etc)
    )),
  populated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- WHERE IT BELONGS IN THE ARCHITECTURE  
  layer           VARCHAR(16)
    CHECK (layer IN ('L0','L1','L2','L3','L4','L5','L6','L7',
                     'L8','L9','L10','L11','CROSS-CUTTING')),
  family          TEXT,         -- Intake / Knowledge / Evidence / Signal / etc.
  table_name      TEXT NOT NULL, -- which table this row lives in

  -- WHAT STATE IT'S IN
  status          TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN (
      'verified',      -- confirmed accurate, real source
      'partial',       -- some fields missing or unconfirmed
      'raw',           -- raw string, not yet structured
      'schema_only',   -- table exists, row is placeholder structure
      'stale'          -- may need re-verification
    )),

  -- LINKS TO ENGINES AND UI (nullable until full registry loaded)
  engine_id       TEXT,         -- FK to engine_registry_v3.engine_name — nullable
  ui_surface      TEXT,         -- which UI page/component surfaces this

  -- VERIFICATION
  verified_by     TEXT,         -- who verified (researcher name, 'claude', 'system')
  verified_at     TIMESTAMPTZ,
  notes           TEXT
);

-- Index for fast lookup by table + layer
CREATE INDEX idx_provenance_table ON provenance(table_name);
CREATE INDEX idx_provenance_layer ON provenance(layer);
CREATE INDEX idx_provenance_status ON provenance(status);
CREATE INDEX idx_provenance_engine ON provenance(engine_id) WHERE engine_id IS NOT NULL;

-- ============================================================
-- ADD provenance_id TO EVERY TABLE THAT HAS DATA
-- All nullable — backfill happens in migration 048
-- ============================================================

-- Knowledge layer (L3)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE tribal_jurisdictions ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE statutes_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE claim_elements_matrix ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE claim_type_metadata ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE filing_templates_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE damages_matrix ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE remedy_templates ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE settlement_calculations ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);

-- Advocacy layer
ALTER TABLE advocacy_organizations ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE legislator_contacts ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE coalition_agencies ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE coalition_networks ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE advocacy_targets ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE policy_domains ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE geographic_nodes ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);

-- Engine / architecture layer
ALTER TABLE engine_registry_v3 ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE engine_families_canonical ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE services_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE workers_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE trpc_routers_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE protected_engines ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE layer_ref ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);

-- Platform state
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE architecture_gaps_log ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE sunam_control_protocol ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE forms_gap_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE manus_stream_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE schema_table_registry ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE reform_legislators ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE reform_campaigns ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
ALTER TABLE reform_media_outlets ADD COLUMN IF NOT EXISTS provenance_id BIGINT REFERENCES provenance(id);
