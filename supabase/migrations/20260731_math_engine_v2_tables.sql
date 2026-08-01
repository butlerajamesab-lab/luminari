-- ============================================================
-- MATH ENGINE v2.0.0 — Required Tables
-- Migration: 20260731_math_engine_v2_tables
--
-- Creates:
--   1. geography_registry — Canonical geography source for area-weighted Poisson
--   2. convergence_receipts — Provenance audit trail for all convergence computations
--   3. claim_definitions — Canonical claim definitions (Rosetta source)
--   4. case_evidence — Evidence items linked to cases and claim elements
-- ============================================================

-- 1. GEOGRAPHY REGISTRY
-- Canonical source for area-weighted convergence detection.
-- No fallback to equal-geography assumptions.
CREATE TABLE IF NOT EXISTS geography_registry (
  id TEXT PRIMARY KEY,
  area_sq_km NUMERIC NOT NULL CHECK (area_sq_km > 0),
  centroid_lat NUMERIC,
  centroid_lon NUMERIC,
  adjacency JSONB DEFAULT '[]'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0.0',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE geography_registry IS 'Canonical geography source for Atlas area-weighted Poisson convergence. No equal-geography fallback.';
COMMENT ON COLUMN geography_registry.area_sq_km IS 'Area in square kilometers — REQUIRED, must be positive';
COMMENT ON COLUMN geography_registry.adjacency IS 'Array of adjacent geography IDs for network kernel';
COMMENT ON COLUMN geography_registry.version IS 'Registry version for provenance tracking';

-- 2. CONVERGENCE RECEIPTS
-- Provenance audit trail for every convergence computation.
-- Immutable — insert only, no updates.
CREATE TABLE IF NOT EXISTS convergence_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equation_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  rule_manifest_hash TEXT NOT NULL,
  as_of BIGINT NOT NULL,
  configuration_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  source_signal_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  geography_registry_version TEXT NOT NULL,
  expected_count NUMERIC,
  observed_count INTEGER NOT NULL,
  computed_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp_computed BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE convergence_receipts IS 'Immutable provenance receipts for all convergence computations. Insert-only.';

CREATE INDEX IF NOT EXISTS idx_convergence_receipts_as_of ON convergence_receipts (as_of);
CREATE INDEX IF NOT EXISTS idx_convergence_receipts_equation ON convergence_receipts (equation_id);
CREATE INDEX IF NOT EXISTS idx_convergence_receipts_engine ON convergence_receipts (engine_version);

-- 3. CLAIM DEFINITIONS
-- Canonical claim type definitions resolved by the viability engine.
-- Source: Rosetta (V3) canonical law decomposition.
CREATE TABLE IF NOT EXISTS claim_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_type TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  elements JSONB NOT NULL DEFAULT '[]'::jsonb,
  statute_of_limitations_days INTEGER NOT NULL,
  source_statute TEXT,
  source_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(claim_type, jurisdiction)
);

COMMENT ON TABLE claim_definitions IS 'Canonical claim definitions from Rosetta. Elements are governed, not caller-supplied.';
COMMENT ON COLUMN claim_definitions.elements IS 'Array of {id, name, description, mandatory, weight} objects';

-- 4. CASE EVIDENCE
-- Evidence items linked to cases and claim elements.
-- Used by viability engine to score element satisfaction.
CREATE TABLE IF NOT EXISTS case_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id TEXT NOT NULL,
  element_id TEXT NOT NULL,
  strength NUMERIC NOT NULL CHECK (strength >= 0 AND strength <= 1),
  source_verified BOOLEAN NOT NULL DEFAULT false,
  document_type TEXT NOT NULL DEFAULT 'document',
  source_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE case_evidence IS 'Evidence items linked to cases. Strength is governed, not caller-invented.';

CREATE INDEX IF NOT EXISTS idx_case_evidence_case ON case_evidence (case_id);
CREATE INDEX IF NOT EXISTS idx_case_evidence_element ON case_evidence (element_id);

-- Enable RLS on all new tables
ALTER TABLE geography_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE convergence_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_evidence ENABLE ROW LEVEL SECURITY;

-- Service role policies (admin access only)
CREATE POLICY "service_role_all" ON geography_registry FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON convergence_receipts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON claim_definitions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON case_evidence FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- IMMUTABLE RECEIPT TRIGGER
-- convergence_receipts are append-only. No UPDATE or DELETE allowed.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_receipt_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'convergence_receipts are immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_convergence_receipts ON convergence_receipts;
CREATE TRIGGER immutable_convergence_receipts
  BEFORE UPDATE OR DELETE ON convergence_receipts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_receipt_mutation();

-- ============================================================
-- SCHEMA MIGRATIONS RECORD
-- Record this migration in the project's migration ledger.
-- ============================================================
INSERT INTO supabase_migrations.schema_migrations (version, name, statements_applied)
VALUES (
  '20260731220000',
  '20260731_math_engine_v2_tables',
  1
)
ON CONFLICT DO NOTHING;
