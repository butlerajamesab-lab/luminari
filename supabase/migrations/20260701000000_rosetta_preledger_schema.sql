-- Rosetta pre-ledger schema baseline
--
-- Purpose: make an empty Supabase preview database structurally capable of
-- replaying the production migration ledger. This file is historical schema
-- material only. It is not a new production DDL change.
--
-- IMPORTANT: Production already contains these objects. Before this branch can
-- be merged, this baseline version must be marked APPLIED in production's
-- migration history with explicit operator approval. Do not execute this file
-- against production.
--
-- ============================================================================
-- LUMINARI V3 — MATHEMATICAL MACHINE SCHEMA
-- 5 Orthogonal Legal Decomposition Layers + 4 Cross-Cutting Formal Systems
-- Version:    LOCKED-2026-04-22
-- Engine:     PostgreSQL 15+ / Supabase
-- ============================================================================
--
-- LAYERS:
--   1. HELP           → help_entity
--   2. WORKFLOW        → workflow_pipeline, workflow_step
--   3. ACCOUNTABILITY  → accountability_route, escalation_node, appeal_pathway
--   4. OVERRIDES       → entity_override
--   5. DEFINITIONS     → term_definition, term_definition_affected_steps
--
-- CROSS-CUTTING SYSTEMS:
--   A. Entity Resolution       → actor_canon, actor_alias
--   B. Temporal Resolution     → entity_override.(effective_date, sunset_date, temporal_status)
--   C. Confidence Classification → extraction_run_config, *.confidence, *.signal_status
--   D. Cryptographic Provenance → *.hash columns, extraction_manifest, extraction_drift_log
--
-- INVARIANTS:
--   V1  Provenance spine on every canonical row
--   V6  temporal_status consistent with effective/sunset dates
--   V7  Expansive/restrictive terms affect ≥1 workflow step
--   V9  enforcement_direction is valid
--   V11 Every source_block has all 5 layer coverage rows
--   V12 Confidence maps correctly to signal_status
--   V16 Escalation nodes are sequential
--   V17 Workflow steps are sequential
--
-- ZERO bill text stored. Content hashes only.
-- ============================================================================

BEGIN

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"

-- ============================================================================
-- INFRASTRUCTURE: PROVENANCE SPINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS corpus (
    id              SERIAL      PRIMARY KEY,
    corpus_name     TEXT        NOT NULL,
    corpus_type     TEXT        DEFAULT 'legislative',
    created_at      TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS source_document (
    id                  SERIAL      PRIMARY KEY,
    corpus_id           INTEGER     NOT NULL REFERENCES corpus(id),
    document_name       TEXT        NOT NULL,
    document_type       TEXT,
    document_identifier TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS extraction_run (
    id                   SERIAL      PRIMARY KEY,
    source_document_id   INTEGER     NOT NULL REFERENCES source_document(id),
    run_version          INTEGER     NOT NULL DEFAULT 1,
    run_status           TEXT        DEFAULT 'in_progress'
        CHECK (run_status IN ('in_progress','completed','failed','validated')),
    confidence_threshold DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    completed_at         TIMESTAMPTZ
)

-- CROSS-CUTTING C: Confidence Classification Config
CREATE TABLE IF NOT EXISTS extraction_run_config (
    id                            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    extraction_run_id             INTEGER     NOT NULL REFERENCES extraction_run(id),
    confidence_threshold          DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    auto_confirm_above_threshold  BOOLEAN     DEFAULT FALSE,
    require_human_review_below    DECIMAL(3,2) DEFAULT 0.70,
    created_at                    TIMESTAMPTZ DEFAULT NOW()
)

-- CROSS-CUTTING D: Source Block Decomposition (content hashes, zero text)
CREATE TABLE IF NOT EXISTS hr1_raw_blocks (
    id                    TEXT        PRIMARY KEY,
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    block_type            TEXT        NOT NULL,
    section_number        TEXT        NOT NULL,
    section_heading_hash  TEXT        NOT NULL,
    block_content_hash    TEXT        NOT NULL,
    parent_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    hierarchy_path        TEXT        NOT NULL,
    char_offset_start     INT         NOT NULL,
    char_offset_end       INT         NOT NULL,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_offset CHECK (char_offset_end > char_offset_start)
)

-- COMPLETENESS ENFORCEMENT: Every block × every layer
CREATE TABLE IF NOT EXISTS layer_coverage (
    id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    extraction_run_id   INTEGER     NOT NULL REFERENCES extraction_run(id),
    source_block_id     TEXT        NOT NULL REFERENCES hr1_raw_blocks(id),
    layer_name          TEXT        NOT NULL
        CHECK (layer_name IN ('HELP','WORKFLOW','ACCOUNTABILITY','OVERRIDES','DEFINITIONS')),
    coverage_status     TEXT        NOT NULL DEFAULT 'pending_extraction'
        CHECK (coverage_status IN ('populated','not_applicable','pending_extraction','extraction_failed')),
    reason              TEXT,
    validated_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(extraction_run_id, source_block_id, layer_name)
)

-- ============================================================================
-- CROSS-CUTTING A: ENTITY RESOLUTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS actor_canon (
    id                  TEXT        PRIMARY KEY,
    canonical_name      TEXT        NOT NULL,
    jurisdiction_level  TEXT,
    agency_link         TEXT,
    entity_type         TEXT        NOT NULL,
    canonical_metadata  JSONB       DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS actor_alias (
    id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    actor_canon_id    TEXT        NOT NULL REFERENCES actor_canon(id),
    raw_actor_string  TEXT        NOT NULL,
    extraction_run_id INTEGER     REFERENCES extraction_run(id),
    confidence        DECIMAL(3,2),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(actor_canon_id, raw_actor_string, extraction_run_id)
)

-- ============================================================================
-- LAYER 1: HELP — What exists?
-- Entity set: programs, benefits, grants, credits, regulatory frameworks
-- ============================================================================

CREATE TABLE IF NOT EXISTS help_entity (
    id                    TEXT        PRIMARY KEY,
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    source_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    entity_name           TEXT        NOT NULL,
    entity_type           TEXT        NOT NULL,
    governing_section     TEXT        NOT NULL,
    status                TEXT        NOT NULL
        CHECK (status IN ('created','modified','repealed','extended')),
    effective_date        TEXT,
    sunset_date           TEXT,
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
)

-- ============================================================================
-- LAYER 2: WORKFLOW — What must happen?
-- Total order: actors × verbs × deadlines, sequenced by step_order
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_pipeline (
    id                    TEXT        PRIMARY KEY,
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    source_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    pipeline_name         TEXT        NOT NULL,
    governing_section     TEXT        NOT NULL,
    pipeline_type         TEXT        NOT NULL,
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS workflow_step (
    id                    TEXT        PRIMARY KEY,
    workflow_pipeline_id  TEXT        NOT NULL REFERENCES workflow_pipeline(id)
                                     ON DELETE CASCADE,
    step_order            INT         NOT NULL,
    step_name             TEXT        NOT NULL,
    actor                 TEXT,
    actor_canon_id        TEXT        REFERENCES actor_canon(id),
    verb                  TEXT,
    governing_section     TEXT,
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workflow_pipeline_id, step_order)
)

-- ============================================================================
-- LAYER 3: ACCOUNTABILITY — What if it doesn't?
-- Directed graph: trigger → consequence escalation chains
-- ============================================================================

CREATE TABLE IF NOT EXISTS accountability_route (
    id                    TEXT        PRIMARY KEY,
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    source_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    route_name            TEXT        NOT NULL,
    governing_section     TEXT        NOT NULL,
    trigger_condition     TEXT        NOT NULL,
    enforcement_type      TEXT        NOT NULL,
    enforcement_actor     TEXT,
    actor_canon_id        TEXT        REFERENCES actor_canon(id),
    enforcement_direction TEXT        NOT NULL DEFAULT 'individual_penalty'
        CHECK (enforcement_direction IN (
            'individual_penalty','agency_mandate',
            'structural_override','reporting_requirement'
        )),
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS escalation_node (
    id                      TEXT        PRIMARY KEY,
    accountability_route_id TEXT        NOT NULL REFERENCES accountability_route(id)
                                        ON DELETE CASCADE,
    node_order              INT         NOT NULL,
    node_name               TEXT        NOT NULL,
    action_required         TEXT        NOT NULL,
    actor_canon_id          TEXT        REFERENCES actor_canon(id),
    escalation_trigger      TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(accountability_route_id, node_order)
)

CREATE TABLE IF NOT EXISTS appeal_pathway (
    id                  TEXT        PRIMARY KEY,
    escalation_node_id  TEXT        NOT NULL REFERENCES escalation_node(id)
                                   ON DELETE CASCADE,
    appeal_type         TEXT        NOT NULL,
    appeal_venue        TEXT,
    appeal_deadline     TEXT,
    governing_section   TEXT,
    confidence          DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status       TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
)

-- ============================================================================
-- LAYER 4: OVERRIDES — What's different here?
-- Exception operators + CROSS-CUTTING B: Temporal Resolution
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_override (
    id                    TEXT        PRIMARY KEY,
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    source_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    override_type         TEXT        NOT NULL,
    overridden_authority  TEXT        NOT NULL,
    override_scope        TEXT        NOT NULL,
    override_condition    TEXT        NOT NULL,
    granting_actor        TEXT,
    actor_canon_id        TEXT        REFERENCES actor_canon(id),
    effective_date        DATE,
    sunset_date           DATE,
    temporal_status       TEXT        DEFAULT 'pending'
        CHECK (temporal_status IN ('pending','active','expired','superseded')),
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
)

-- ============================================================================
-- LAYER 5: DEFINITIONS — What do the words mean?
-- Term rewriting system: substitution rules propagating through workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS term_definition (
    id                    TEXT        PRIMARY KEY,
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    source_block_id       TEXT        REFERENCES hr1_raw_blocks(id),
    defined_term          TEXT        NOT NULL,
    defining_section      TEXT        NOT NULL,
    definition_text       TEXT        NOT NULL,
    definition_type       TEXT        NOT NULL
        CHECK (definition_type IN ('expansive','restrictive','technical','clarifying')),
    confidence            DECIMAL(3,2) DEFAULT 1.00
        CHECK (confidence BETWEEN 0 AND 1),
    signal_status         TEXT        DEFAULT 'tentative'
        CHECK (signal_status IN ('confirmed','tentative','human_review_required')),
    created_at            TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS term_definition_affected_steps (
    id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    term_definition_id  TEXT        NOT NULL REFERENCES term_definition(id),
    workflow_step_id    TEXT        NOT NULL REFERENCES workflow_step(id),
    effect_type         TEXT        DEFAULT 'modifies_boundary'
        CHECK (effect_type IN (
            'modifies_boundary','creates_exemption',
            'restricts_scope','expands_scope'
        )),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(term_definition_id, workflow_step_id)
)

-- ============================================================================
-- CROSS-CUTTING D: CRYPTOGRAPHIC PROVENANCE
-- Drift detection + hash verification + validation audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_manifest (
    id                    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    extraction_run_id     INTEGER     NOT NULL REFERENCES extraction_run(id),
    source_document_id    INTEGER     NOT NULL REFERENCES source_document(id),
    corpus_id             INTEGER     NOT NULL REFERENCES corpus(id),
    canon_version         INTEGER     NOT NULL DEFAULT 1,
    executed_at           TIMESTAMPTZ DEFAULT NOW(),
    source_hash           TEXT        NOT NULL,
    row_counts            JSONB       NOT NULL,
    validation_results    JSONB       NOT NULL,
    drift_events          JSONB       DEFAULT '[]'::jsonb,
    status                TEXT        NOT NULL
        CHECK (status IN ('clean','drift_detected','failed'))
)

CREATE TABLE IF NOT EXISTS extraction_drift_log (
    id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    run_id          INTEGER     NOT NULL REFERENCES extraction_run(id),
    previous_run_id INTEGER,
    table_name      TEXT        NOT NULL,
    section_number  TEXT,
    drift_type      TEXT        NOT NULL
        CHECK (drift_type IN ('ADDED','DELETED','CHANGED')),
    old_value_hash  TEXT,
    new_value_hash  TEXT,
    logged_at       TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE IF NOT EXISTS validation_result (
    id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    extraction_run_id   INTEGER     NOT NULL REFERENCES extraction_run(id),
    test_name           TEXT        NOT NULL,
    test_result         TEXT        NOT NULL
        CHECK (test_result IN ('pass','fail')),
    failure_count       INTEGER     DEFAULT 0,
    details             JSONB,
    executed_at         TIMESTAMPTZ DEFAULT NOW()
)

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Provenance spine lookups
CREATE INDEX IF NOT EXISTS idx_blocks_run        ON hr1_raw_blocks(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_blocks_section    ON hr1_raw_blocks(section_number)

CREATE INDEX IF NOT EXISTS idx_coverage_run      ON layer_coverage(extraction_run_id, source_block_id)

-- Entity resolution
CREATE INDEX IF NOT EXISTS idx_alias_canon       ON actor_alias(actor_canon_id)

CREATE INDEX IF NOT EXISTS idx_alias_raw         ON actor_alias(raw_actor_string)

-- Layer 1: HELP
CREATE INDEX IF NOT EXISTS idx_help_run          ON help_entity(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_help_section      ON help_entity(governing_section)

-- Layer 2: WORKFLOW
CREATE INDEX IF NOT EXISTS idx_pipeline_run      ON workflow_pipeline(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_step_pipeline     ON workflow_step(workflow_pipeline_id, step_order)

-- Layer 3: ACCOUNTABILITY
CREATE INDEX IF NOT EXISTS idx_route_run         ON accountability_route(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_route_direction   ON accountability_route(enforcement_direction)

CREATE INDEX IF NOT EXISTS idx_node_route        ON escalation_node(accountability_route_id, node_order)

CREATE INDEX IF NOT EXISTS idx_appeal_node       ON appeal_pathway(escalation_node_id)

-- Layer 4: OVERRIDES
CREATE INDEX IF NOT EXISTS idx_override_run      ON entity_override(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_override_temporal  ON entity_override(temporal_status, effective_date, sunset_date)

-- Layer 5: DEFINITIONS
CREATE INDEX IF NOT EXISTS idx_term_run          ON term_definition(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_term_affected     ON term_definition_affected_steps(term_definition_id)

-- Infrastructure
CREATE UNIQUE INDEX IF NOT EXISTS idx_manifest_run ON extraction_manifest(extraction_run_id)

CREATE INDEX IF NOT EXISTS idx_drift_run         ON extraction_drift_log(run_id)

CREATE INDEX IF NOT EXISTS idx_validation_run    ON validation_result(extraction_run_id)

-- ============================================================================
-- EXTRACTION OUTPUT CONTRACT: Views per layer
-- ============================================================================

CREATE OR REPLACE VIEW v_extraction_help AS
SELECT h.*, rb.section_number, rb.hierarchy_path
FROM help_entity h
JOIN hr1_raw_blocks rb ON rb.id = h.source_block_id

CREATE OR REPLACE VIEW v_extraction_workflow AS
SELECT wp.id AS pipeline_id, wp.pipeline_name, wp.pipeline_type,
       ws.step_order, ws.step_name, ws.actor, ws.verb,
       ac.canonical_name AS actor_canonical,
       rb.section_number, rb.hierarchy_path,
       wp.extraction_run_id
FROM workflow_pipeline wp
JOIN workflow_step ws ON ws.workflow_pipeline_id = wp.id
LEFT JOIN actor_canon ac ON ac.id = ws.actor_canon_id
JOIN hr1_raw_blocks rb ON rb.id = wp.source_block_id
ORDER BY wp.id, ws.step_order

CREATE OR REPLACE VIEW v_extraction_accountability AS
SELECT ar.id AS route_id, ar.route_name, ar.enforcement_type,
       ar.enforcement_direction,
       en.node_order, en.node_name, en.action_required,
       ap.appeal_type, ap.appeal_venue, ap.appeal_deadline,
       ac.canonical_name AS enforcement_actor_canonical,
       rb.section_number, rb.hierarchy_path,
       ar.extraction_run_id
FROM accountability_route ar
JOIN escalation_node en ON en.accountability_route_id = ar.id
LEFT JOIN appeal_pathway ap ON ap.escalation_node_id = en.id
LEFT JOIN actor_canon ac ON ac.id = ar.actor_canon_id
JOIN hr1_raw_blocks rb ON rb.id = ar.source_block_id
ORDER BY ar.id, en.node_order

CREATE OR REPLACE VIEW v_extraction_overrides AS
SELECT eo.*, ac.canonical_name AS granting_actor_canonical,
       rb.section_number, rb.hierarchy_path
FROM entity_override eo
LEFT JOIN actor_canon ac ON ac.id = eo.actor_canon_id
JOIN hr1_raw_blocks rb ON rb.id = eo.source_block_id

CREATE OR REPLACE VIEW v_extraction_definitions AS
SELECT td.defined_term, td.definition_type, td.definition_text,
       td.defining_section,
       ws.step_name AS affected_step, ws.step_order,
       tdas.effect_type,
       rb.section_number, rb.hierarchy_path,
       td.extraction_run_id
FROM term_definition td
LEFT JOIN term_definition_affected_steps tdas ON tdas.term_definition_id = td.id
LEFT JOIN workflow_step ws ON ws.id = tdas.workflow_step_id
JOIN hr1_raw_blocks rb ON rb.id = td.source_block_id

-- Layer coverage summary per block
CREATE OR REPLACE VIEW v_layer_coverage_summary AS
SELECT rb.section_number,
       COUNT(DISTINCT lc.layer_name) AS layers_marked,
       COUNT(DISTINCT lc.layer_name) FILTER (WHERE lc.coverage_status = 'populated') AS layers_populated,
       COUNT(DISTINCT lc.layer_name) FILTER (WHERE lc.coverage_status = 'not_applicable') AS layers_na,
       COUNT(DISTINCT lc.layer_name) FILTER (WHERE lc.coverage_status IN ('pending_extraction','extraction_failed')) AS layers_incomplete,
       lc.extraction_run_id
FROM hr1_raw_blocks rb
JOIN layer_coverage lc ON lc.source_block_id = rb.id
GROUP BY rb.section_number, lc.extraction_run_id

-- ============================================================================
-- HASH VERIFICATION FUNCTION
-- Compare manifest hashes against current extraction state
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_extraction_hashes(p_run_id INTEGER)
RETURNS TABLE(check_name TEXT, status TEXT, detail TEXT) AS $$
BEGIN
    -- Check manifest exists
    RETURN QUERY
    SELECT 'manifest_exists'::TEXT,
           CASE WHEN COUNT(*) = 1 THEN 'pass' ELSE 'fail' END,
           'Manifests found: ' || COUNT(*)::TEXT
    FROM extraction_manifest WHERE extraction_run_id = p_run_id;

    -- Check block hashes are non-empty
    RETURN QUERY
    SELECT 'block_hashes_present'::TEXT,
           CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END,
           'Empty hashes: ' || COUNT(*)::TEXT
    FROM hr1_raw_blocks
    WHERE extraction_run_id = p_run_id
      AND (section_heading_hash = '' OR block_content_hash = ''
           OR section_heading_hash IS NULL OR block_content_hash IS NULL);

    -- Check no drift since last clean manifest
    RETURN QUERY
    SELECT 'no_unresolved_drift'::TEXT,
           CASE WHEN COUNT(*) = 0 THEN 'pass' ELSE 'fail' END,
           'Unresolved drift events: ' || COUNT(*)::TEXT
    FROM extraction_drift_log
    WHERE run_id = p_run_id;
END;
$$ LANGUAGE plpgsql

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE corpus ENABLE ROW LEVEL SECURITY

ALTER TABLE source_document ENABLE ROW LEVEL SECURITY

ALTER TABLE extraction_run ENABLE ROW LEVEL SECURITY

ALTER TABLE extraction_run_config ENABLE ROW LEVEL SECURITY

ALTER TABLE hr1_raw_blocks ENABLE ROW LEVEL SECURITY

ALTER TABLE layer_coverage ENABLE ROW LEVEL SECURITY

ALTER TABLE actor_canon ENABLE ROW LEVEL SECURITY

ALTER TABLE actor_alias ENABLE ROW LEVEL SECURITY

ALTER TABLE help_entity ENABLE ROW LEVEL SECURITY

ALTER TABLE workflow_pipeline ENABLE ROW LEVEL SECURITY

ALTER TABLE workflow_step ENABLE ROW LEVEL SECURITY

ALTER TABLE accountability_route ENABLE ROW LEVEL SECURITY

ALTER TABLE escalation_node ENABLE ROW LEVEL SECURITY

ALTER TABLE appeal_pathway ENABLE ROW LEVEL SECURITY

ALTER TABLE entity_override ENABLE ROW LEVEL SECURITY

ALTER TABLE term_definition ENABLE ROW LEVEL SECURITY

ALTER TABLE term_definition_affected_steps ENABLE ROW LEVEL SECURITY

ALTER TABLE extraction_manifest ENABLE ROW LEVEL SECURITY

ALTER TABLE extraction_drift_log ENABLE ROW LEVEL SECURITY

ALTER TABLE validation_result ENABLE ROW LEVEL SECURITY

COMMIT

-- Pre-ledger template compatibility tables
begin

create table public.users (
  id bigint generated always as identity primary key,
  username text not null unique,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
)

create table public.posts (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  published boolean not null default true,
  created_at timestamptz not null default now()
)

create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
)

commit

-- Pre-ledger civic-genome read function
CREATE OR REPLACE FUNCTION public.get_rosetta_law_view(p_corpus_id integer DEFAULT NULL::integer, p_statute_ref text DEFAULT NULL::text, p_jurisdiction text DEFAULT NULL::text, p_extraction_run_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_run record;
  v_method text := 'none';
  v_priority integer := NULL;
  v_candidates jsonb := '[]'::jsonb;
  v_match_count integer := 0;
  v_missing_inputs text[] := ARRAY[]::text[];
  v_errors text[] := ARRAY[]::text[];
  v_missing_layers text[] := ARRAY[]::text[];
  v_availability text := 'unavailable';

  v_matched_law jsonb := '[]'::jsonb;
  v_protections jsonb := '[]'::jsonb;
  v_workflow_pipelines jsonb := '[]'::jsonb;
  v_accountability_routes jsonb := '[]'::jsonb;
  v_definitions jsonb := '[]'::jsonb;
  v_overrides jsonb := '[]'::jsonb;
  v_manifest jsonb := '{}'::jsonb;
  v_layer_coverage jsonb := '[]'::jsonb;

  v_protections_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_definitions_count integer := 0;
  v_overrides_count integer := 0;
  v_any_data boolean := false;
  v_layer_query_failed boolean := false;

  v_cov_protections text := 'empty';
  v_cov_workflow text := 'empty';
  v_cov_accountability text := 'empty';
  v_cov_overrides text := 'empty';
  v_cov_definitions text := 'empty';

  v_manifest_id text := NULL;
  v_manifest_json jsonb := '{}'::jsonb;
  v_total_source_blocks integer := 0;
  v_total_entities_extracted integer := 0;
  v_total_workflows_extracted integer := 0;
  v_total_accountability_routes integer := 0;
  v_total_overrides integer := 0;
  v_total_definitions integer := 0;
  v_hash_algorithm text := NULL;
  v_validation_status text := NULL;
  v_manifest_created_at timestamptz := NULL;
BEGIN
  IF p_extraction_run_id IS NULL AND p_corpus_id IS NULL AND p_statute_ref IS NULL AND p_jurisdiction IS NULL THEN
    v_missing_inputs := ARRAY['corpus_id', 'statute_ref', 'jurisdiction', 'extraction_run_id'];
    v_errors := array_append(v_errors, 'no_lookup_parameters_provided');

    RETURN jsonb_build_object(
      'identity', jsonb_build_object('extraction_run_id', NULL, 'corpus_id', NULL, 'source_document_id', NULL, 'canon_version', NULL, 'statute_ref', NULL, 'jurisdiction', NULL),
      'lookup_resolution', jsonb_build_object(
        'method', v_method,
        'priority', v_priority,
        'input', jsonb_build_object('corpus_id', p_corpus_id, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction, 'extraction_run_id', p_extraction_run_id),
        'resolved', jsonb_build_object('corpus_id', NULL, 'source_document_id', NULL, 'extraction_run_id', NULL, 'statute_ref', NULL, 'jurisdiction', NULL)
      ),
      'law_view', jsonb_build_object(
        'matched_law', '[]'::jsonb, 'protections', '[]'::jsonb, 'workflow_pipelines', '[]'::jsonb, 'accountability_routes', '[]'::jsonb, 'definitions', '[]'::jsonb, 'overrides', '[]'::jsonb,
        'provenance', jsonb_build_object('source_documents', '[]'::jsonb, 'source_blocks', '[]'::jsonb, 'hashes', '[]'::jsonb, 'extraction_manifest', '{}'::jsonb, 'layer_coverage', '[]'::jsonb, 'extraction_run_id', NULL, 'canon_version', NULL, 'validation_status', NULL, 'total_source_blocks', 0, 'total_entities_extracted', 0, 'total_workflows_extracted', 0, 'total_accountability_routes', 0, 'total_overrides', 0, 'total_definitions', 0, 'hash_algorithm', NULL)
      ),
      'coverage', jsonb_build_object('protections', 'empty', 'workflow', 'empty', 'accountability', 'empty', 'overrides', 'empty', 'definitions', 'empty'),
      'context', jsonb_build_object('rosetta_extraction_run_id', NULL, 'rosetta_canon_version', NULL),
      'availability', jsonb_build_object('rosetta', 'unavailable', 'missing_inputs', to_jsonb(v_missing_inputs), 'missing_layers', '[]'::jsonb, 'errors', to_jsonb(v_errors)),
      'candidates', '[]'::jsonb
    );
  ELSIF p_extraction_run_id IS NOT NULL THEN
    v_method := 'extraction_run_id';
    v_priority := 1;
    SELECT er.id AS extraction_run_id,
           er.source_document_id,
           COALESCE(em.canon_version, er.run_version) AS canon_version,
           er.run_status AS extraction_status,
           er.created_at AS started_at,
           sd.corpus_id,
           sd.document_identifier AS statute_ref,
           sd.document_name AS title,
           NULL::date AS enacted_date,
           NULL::text AS jurisdiction,
           c.corpus_type AS domain
      INTO v_run
      FROM public.extraction_run er
      JOIN public.source_document sd ON sd.id = er.source_document_id
      JOIN public.corpus c ON c.id = sd.corpus_id
      LEFT JOIN LATERAL (
        SELECT em1.canon_version
          FROM public.extraction_manifest em1
         WHERE em1.extraction_run_id = er.id
         ORDER BY em1.executed_at DESC NULLS LAST, em1.id DESC
         LIMIT 1
      ) em ON true
     WHERE er.id = p_extraction_run_id
     LIMIT 1;
  ELSIF p_corpus_id IS NOT NULL THEN
    v_method := 'corpus_id';
    v_priority := 2;
    SELECT er.id AS extraction_run_id,
           er.source_document_id,
           COALESCE(em.canon_version, er.run_version) AS canon_version,
           er.run_status AS extraction_status,
           er.created_at AS started_at,
           sd.corpus_id,
           sd.document_identifier AS statute_ref,
           sd.document_name AS title,
           NULL::date AS enacted_date,
           NULL::text AS jurisdiction,
           c.corpus_type AS domain
      INTO v_run
      FROM public.corpus c
      JOIN public.source_document sd ON sd.corpus_id = c.id
      JOIN public.extraction_run er ON er.source_document_id = sd.id
      LEFT JOIN LATERAL (
        SELECT em1.canon_version
          FROM public.extraction_manifest em1
         WHERE em1.extraction_run_id = er.id
         ORDER BY em1.executed_at DESC NULLS LAST, em1.id DESC
         LIMIT 1
      ) em ON true
     WHERE c.id = p_corpus_id
     ORDER BY er.created_at DESC NULLS LAST, er.id DESC
     LIMIT 1;
  ELSIF p_statute_ref IS NOT NULL AND p_jurisdiction IS NOT NULL THEN
    v_method := 'statute_ref_jurisdiction';
    v_priority := 3;
    v_errors := array_append(v_errors, 'jurisdiction_lookup_not_supported_by_current_schema');

    RETURN jsonb_build_object(
      'identity', jsonb_build_object('extraction_run_id', NULL, 'corpus_id', NULL, 'source_document_id', NULL, 'canon_version', NULL, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction),
      'lookup_resolution', jsonb_build_object(
        'method', v_method,
        'priority', v_priority,
        'input', jsonb_build_object('corpus_id', p_corpus_id, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction, 'extraction_run_id', p_extraction_run_id),
        'resolved', jsonb_build_object('corpus_id', NULL, 'source_document_id', NULL, 'extraction_run_id', NULL, 'statute_ref', NULL, 'jurisdiction', NULL)
      ),
      'law_view', jsonb_build_object(
        'matched_law', '[]'::jsonb, 'protections', '[]'::jsonb, 'workflow_pipelines', '[]'::jsonb, 'accountability_routes', '[]'::jsonb, 'definitions', '[]'::jsonb, 'overrides', '[]'::jsonb,
        'provenance', jsonb_build_object('source_documents', '[]'::jsonb, 'source_blocks', '[]'::jsonb, 'hashes', '[]'::jsonb, 'extraction_manifest', '{}'::jsonb, 'layer_coverage', '[]'::jsonb, 'extraction_run_id', NULL, 'canon_version', NULL, 'validation_status', NULL, 'total_source_blocks', 0, 'total_entities_extracted', 0, 'total_workflows_extracted', 0, 'total_accountability_routes', 0, 'total_overrides', 0, 'total_definitions', 0, 'hash_algorithm', NULL)
      ),
      'coverage', jsonb_build_object('protections', 'empty', 'workflow', 'empty', 'accountability', 'empty', 'overrides', 'empty', 'definitions', 'empty'),
      'context', jsonb_build_object('rosetta_extraction_run_id', NULL, 'rosetta_canon_version', NULL),
      'availability', jsonb_build_object('rosetta', 'unavailable', 'missing_inputs', '[]'::jsonb, 'missing_layers', '[]'::jsonb, 'errors', to_jsonb(v_errors)),
      'candidates', '[]'::jsonb
    );
  ELSIF p_statute_ref IS NOT NULL THEN
    v_method := 'statute_ref';
    v_priority := 4;

    SELECT count(*) INTO v_match_count
      FROM public.source_document sd
     WHERE sd.document_identifier = p_statute_ref;

    IF v_match_count > 1 THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'corpus_id', c.id,
               'jurisdiction', NULL,
               'domain', c.corpus_type,
               'source_document_id', sd.id,
               'statute_ref', sd.document_identifier,
               'citation_key', sd.document_identifier,
               'title', sd.document_name,
               'enacted_date', NULL
             ) ORDER BY c.id, sd.id), '[]'::jsonb)
        INTO v_candidates
        FROM public.source_document sd
        JOIN public.corpus c ON c.id = sd.corpus_id
       WHERE sd.document_identifier = p_statute_ref;

      RETURN jsonb_build_object(
        'identity', jsonb_build_object('extraction_run_id', NULL, 'corpus_id', NULL, 'source_document_id', NULL, 'canon_version', NULL, 'statute_ref', p_statute_ref, 'jurisdiction', NULL),
        'lookup_resolution', jsonb_build_object(
          'method', v_method,
          'priority', v_priority,
          'input', jsonb_build_object('corpus_id', p_corpus_id, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction, 'extraction_run_id', p_extraction_run_id),
          'resolved', jsonb_build_object('corpus_id', NULL, 'source_document_id', NULL, 'extraction_run_id', NULL, 'statute_ref', p_statute_ref, 'jurisdiction', NULL)
        ),
        'law_view', jsonb_build_object(
          'matched_law', '[]'::jsonb, 'protections', '[]'::jsonb, 'workflow_pipelines', '[]'::jsonb, 'accountability_routes', '[]'::jsonb, 'definitions', '[]'::jsonb, 'overrides', '[]'::jsonb,
          'provenance', jsonb_build_object('source_documents', '[]'::jsonb, 'source_blocks', '[]'::jsonb, 'hashes', '[]'::jsonb, 'extraction_manifest', '{}'::jsonb, 'layer_coverage', '[]'::jsonb, 'extraction_run_id', NULL, 'canon_version', NULL, 'validation_status', NULL, 'total_source_blocks', 0, 'total_entities_extracted', 0, 'total_workflows_extracted', 0, 'total_accountability_routes', 0, 'total_overrides', 0, 'total_definitions', 0, 'hash_algorithm', NULL)
        ),
        'coverage', jsonb_build_object('protections', 'empty', 'workflow', 'empty', 'accountability', 'empty', 'overrides', 'empty', 'definitions', 'empty'),
        'context', jsonb_build_object('rosetta_extraction_run_id', NULL, 'rosetta_canon_version', NULL),
        'availability', jsonb_build_object('rosetta', 'partial', 'missing_inputs', jsonb_build_array('jurisdiction'), 'missing_layers', '[]'::jsonb, 'errors', jsonb_build_array('ambiguous_statute_ref')),
        'candidates', v_candidates
      );
    ELSIF v_match_count = 1 THEN
      SELECT er.id AS extraction_run_id,
             er.source_document_id,
             COALESCE(em.canon_version, er.run_version) AS canon_version,
             er.run_status AS extraction_status,
             er.created_at AS started_at,
             sd.corpus_id,
             sd.document_identifier AS statute_ref,
             sd.document_name AS title,
             NULL::date AS enacted_date,
             NULL::text AS jurisdiction,
             c.corpus_type AS domain
        INTO v_run
        FROM public.source_document sd
        JOIN public.corpus c ON c.id = sd.corpus_id
        JOIN public.extraction_run er ON er.source_document_id = sd.id
        LEFT JOIN LATERAL (
          SELECT em1.canon_version
            FROM public.extraction_manifest em1
           WHERE em1.extraction_run_id = er.id
           ORDER BY em1.executed_at DESC NULLS LAST, em1.id DESC
           LIMIT 1
        ) em ON true
       WHERE sd.document_identifier = p_statute_ref
       ORDER BY er.created_at DESC NULLS LAST, er.id DESC
       LIMIT 1;
    END IF;
  ELSE
    v_errors := array_append(v_errors, 'insufficient_lookup_parameters');
    v_missing_inputs := ARRAY['corpus_id', 'statute_ref', 'extraction_run_id'];
  END IF;

  IF v_run.extraction_run_id IS NULL THEN
    IF array_length(v_missing_inputs, 1) IS NULL THEN
      IF p_extraction_run_id IS NULL THEN v_missing_inputs := array_append(v_missing_inputs, 'extraction_run_id'); END IF;
      IF p_corpus_id IS NULL THEN v_missing_inputs := array_append(v_missing_inputs, 'corpus_id'); END IF;
      IF p_statute_ref IS NULL THEN v_missing_inputs := array_append(v_missing_inputs, 'statute_ref'); END IF;
      IF p_statute_ref IS NOT NULL AND p_jurisdiction IS NULL THEN v_missing_inputs := array_append(v_missing_inputs, 'jurisdiction'); END IF;
    END IF;
    IF NOT ('no_lookup_parameters_provided' = ANY(v_errors)) AND NOT ('insufficient_lookup_parameters' = ANY(v_errors)) THEN
      v_errors := array_append(v_errors, 'no_matching_extraction_run');
    END IF;

    RETURN jsonb_build_object(
      'identity', jsonb_build_object('extraction_run_id', NULL, 'corpus_id', NULL, 'source_document_id', NULL, 'canon_version', NULL, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction),
      'lookup_resolution', jsonb_build_object(
        'method', v_method,
        'priority', v_priority,
        'input', jsonb_build_object('corpus_id', p_corpus_id, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction, 'extraction_run_id', p_extraction_run_id),
        'resolved', jsonb_build_object('corpus_id', NULL, 'source_document_id', NULL, 'extraction_run_id', NULL, 'statute_ref', NULL, 'jurisdiction', NULL)
      ),
      'law_view', jsonb_build_object(
        'matched_law', '[]'::jsonb, 'protections', '[]'::jsonb, 'workflow_pipelines', '[]'::jsonb, 'accountability_routes', '[]'::jsonb, 'definitions', '[]'::jsonb, 'overrides', '[]'::jsonb,
        'provenance', jsonb_build_object('source_documents', '[]'::jsonb, 'source_blocks', '[]'::jsonb, 'hashes', '[]'::jsonb, 'extraction_manifest', '{}'::jsonb, 'layer_coverage', '[]'::jsonb, 'extraction_run_id', NULL, 'canon_version', NULL, 'validation_status', NULL, 'total_source_blocks', 0, 'total_entities_extracted', 0, 'total_workflows_extracted', 0, 'total_accountability_routes', 0, 'total_overrides', 0, 'total_definitions', 0, 'hash_algorithm', NULL)
      ),
      'coverage', jsonb_build_object('protections', 'empty', 'workflow', 'empty', 'accountability', 'empty', 'overrides', 'empty', 'definitions', 'empty'),
      'context', jsonb_build_object('rosetta_extraction_run_id', NULL, 'rosetta_canon_version', NULL),
      'availability', jsonb_build_object('rosetta', 'unavailable', 'missing_inputs', to_jsonb(v_missing_inputs), 'missing_layers', '[]'::jsonb, 'errors', to_jsonb(v_errors)),
      'candidates', '[]'::jsonb
    );
  END IF;

  v_matched_law := jsonb_build_array(jsonb_build_object(
    'corpus_id', v_run.corpus_id,
    'jurisdiction', v_run.jurisdiction,
    'domain', v_run.domain,
    'source_document_id', v_run.source_document_id,
    'citation_key', v_run.statute_ref,
    'statute_ref', v_run.statute_ref,
    'title', v_run.title,
    'enacted_date', v_run.enacted_date
  ));

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', he.id, 'corpus_id', he.corpus_id, 'source_document_id', he.source_document_id, 'extraction_run_id', he.extraction_run_id, 'canon_version', he.canon_version,
             'source_block_id', he.source_block_id, 'entity_name', he.entity_name, 'entity_type', he.entity_type, 'governing_section', he.governing_section,
             'status', he.status, 'effective_date', he.effective_date, 'sunset_date', he.sunset_date, 'confidence', he.confidence, 'signal_status', he.signal_status
           ) ORDER BY he.id), '[]'::jsonb), count(*)
      INTO v_protections, v_protections_count
      FROM public.help_entity he
     WHERE he.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'protections_query_failed'); v_missing_layers := array_append(v_missing_layers, 'protections');
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', wp.id, 'pipeline_id', wp.id, 'corpus_id', wp.corpus_id, 'source_document_id', wp.source_document_id, 'extraction_run_id', wp.extraction_run_id,
             'canon_version', wp.canon_version, 'source_block_id', wp.source_block_id, 'pipeline_name', wp.pipeline_name, 'governing_section', wp.governing_section,
             'pipeline_type', wp.pipeline_type, 'confidence', wp.confidence, 'signal_status', wp.signal_status,
             'steps', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'id', ws.id, 'workflow_pipeline_id', ws.workflow_pipeline_id, 'step_order', ws.step_order, 'step_name', ws.step_name,
                        'actor', ws.actor, 'actor_canon_id', ws.actor_canon_id,
                        'actor_canon', CASE WHEN ac.id IS NULL THEN NULL ELSE jsonb_build_object('id', ac.id, 'canonical_name', ac.canonical_name, 'actor_type', ac.entity_type, 'jurisdiction', ac.jurisdiction_level, 'parent_actor_id', NULL) END,
                        'verb', ws.verb, 'governing_section', ws.governing_section, 'confidence', ws.confidence, 'signal_status', ws.signal_status
                      ) ORDER BY ws.step_order, ws.id)
                 FROM public.workflow_step ws
                 LEFT JOIN public.actor_canon ac ON ac.id = ws.actor_canon_id
                WHERE ws.workflow_pipeline_id = wp.id
             ), '[]'::jsonb)
           ) ORDER BY wp.id), '[]'::jsonb), count(*)
      INTO v_workflow_pipelines, v_workflow_count
      FROM public.workflow_pipeline wp
     WHERE wp.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'workflow_query_failed'); v_missing_layers := array_append(v_missing_layers, 'workflow');
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', ar.id, 'corpus_id', ar.corpus_id, 'source_document_id', ar.source_document_id, 'extraction_run_id', ar.extraction_run_id, 'canon_version', ar.canon_version,
             'source_block_id', ar.source_block_id, 'route_name', ar.route_name, 'governing_section', ar.governing_section, 'trigger_condition', ar.trigger_condition,
             'responsible_actor', ar.enforcement_actor, 'actor', ar.enforcement_actor, 'actor_canon_id', ar.actor_canon_id,
             'actor_canon', CASE WHEN ac.id IS NULL THEN NULL ELSE jsonb_build_object('id', ac.id, 'canonical_name', ac.canonical_name, 'actor_type', ac.entity_type, 'jurisdiction', ac.jurisdiction_level, 'parent_actor_id', NULL) END,
             'enforcement_mechanism', ar.enforcement_type, 'penalty_range', NULL, 'enforcement_direction', ar.enforcement_direction, 'confidence', ar.confidence, 'signal_status', ar.signal_status,
             'escalation_nodes', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'id', en.id, 'accountability_route_id', en.accountability_route_id, 'escalation_order', en.node_order, 'node_name', en.node_name,
                        'authority_level', NULL, 'actor', NULL, 'actor_canon_id', en.actor_canon_id,
                        'actor_canon', CASE WHEN eac.id IS NULL THEN NULL ELSE jsonb_build_object('id', eac.id, 'canonical_name', eac.canonical_name, 'actor_type', eac.entity_type, 'jurisdiction', eac.jurisdiction_level, 'parent_actor_id', NULL) END,
                        'action_verb', en.action_required, 'deadline_text', NULL, 'confidence', NULL, 'escalation_trigger', en.escalation_trigger
                      ) ORDER BY en.node_order, en.id)
                 FROM public.escalation_node en
                 LEFT JOIN public.actor_canon eac ON eac.id = en.actor_canon_id
                WHERE en.accountability_route_id = ar.id
             ), '[]'::jsonb),
             'appeal_pathways', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'id', ap.id, 'accountability_route_id', ar.id, 'pathway_order', NULL, 'pathway_name', ap.appeal_type,
                        'filing_deadline_text', ap.appeal_deadline, 'filing_body', ap.appeal_venue, 'actor', NULL, 'actor_canon_id', NULL,
                        'actor_canon', NULL, 'standard_of_review', NULL, 'governing_section', ap.governing_section, 'confidence', ap.confidence, 'signal_status', ap.signal_status
                      ) ORDER BY ap.id)
                 FROM public.escalation_node en2
                 JOIN public.appeal_pathway ap ON ap.escalation_node_id = en2.id
                WHERE en2.accountability_route_id = ar.id
             ), '[]'::jsonb)
           ) ORDER BY ar.id), '[]'::jsonb), count(*)
      INTO v_accountability_routes, v_accountability_count
      FROM public.accountability_route ar
      LEFT JOIN public.actor_canon ac ON ac.id = ar.actor_canon_id
     WHERE ar.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'accountability_query_failed'); v_missing_layers := array_append(v_missing_layers, 'accountability');
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', td.id, 'corpus_id', td.corpus_id, 'source_document_id', td.source_document_id, 'extraction_run_id', td.extraction_run_id, 'canon_version', td.canon_version,
             'source_block_id', td.source_block_id, 'term', td.defined_term, 'definition_text', td.definition_text, 'scope', td.defining_section, 'effect_type', td.definition_type,
             'confidence', td.confidence, 'signal_status', td.signal_status,
             'affected_step_ids', COALESCE((SELECT jsonb_agg(tdast.workflow_step_id ORDER BY tdast.workflow_step_id) FROM public.term_definition_affected_steps tdast WHERE tdast.term_definition_id = td.id), '[]'::jsonb)
           ) ORDER BY td.id), '[]'::jsonb), count(*)
      INTO v_definitions, v_definitions_count
      FROM public.term_definition td
     WHERE td.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'definitions_query_failed'); v_missing_layers := array_append(v_missing_layers, 'definitions');
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', eo.id, 'corpus_id', eo.corpus_id, 'source_document_id', eo.source_document_id, 'extraction_run_id', eo.extraction_run_id, 'canon_version', eo.canon_version,
             'source_block_id', eo.source_block_id, 'override_type', eo.override_type, 'overridden_authority', eo.overridden_authority, 'override_scope', eo.override_scope,
             'override_condition', eo.override_condition, 'granting_actor', eo.granting_actor, 'actor', eo.granting_actor, 'actor_canon_id', eo.actor_canon_id,
             'actor_canon', CASE WHEN ac.id IS NULL THEN NULL ELSE jsonb_build_object('id', ac.id, 'canonical_name', ac.canonical_name, 'actor_type', ac.entity_type, 'jurisdiction', ac.jurisdiction_level, 'parent_actor_id', NULL) END,
             'effective_date', eo.effective_date, 'sunset_date', eo.sunset_date, 'confidence', eo.confidence, 'signal_status', eo.signal_status
           ) ORDER BY eo.id), '[]'::jsonb), count(*)
      INTO v_overrides, v_overrides_count
      FROM public.entity_override eo
      LEFT JOIN public.actor_canon ac ON ac.id = eo.actor_canon_id
     WHERE eo.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'overrides_query_failed'); v_missing_layers := array_append(v_missing_layers, 'overrides');
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', lc.id, 'extraction_run_id', lc.extraction_run_id, 'section_number', NULL, 'hierarchy_path', NULL, 'source_block_id', lc.source_block_id,
             'layer_name', lc.layer_name, 'coverage_status', lc.coverage_status, 'row_count', NULL, 'notes', lc.reason, 'validated_at', lc.validated_at
           ) ORDER BY lc.id), '[]'::jsonb)
      INTO v_layer_coverage
      FROM public.layer_coverage lc
     WHERE lc.extraction_run_id = v_run.extraction_run_id;
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'layer_coverage_query_failed'); v_missing_layers := array_append(v_missing_layers, 'layer_coverage');
  END;

  BEGIN
    SELECT em.id,
           jsonb_build_object('id', em.id, 'extraction_run_id', em.extraction_run_id, 'source_document_id', em.source_document_id, 'corpus_id', em.corpus_id, 'canon_version', em.canon_version, 'executed_at', em.executed_at, 'source_hash', em.source_hash, 'row_counts', em.row_counts, 'validation_results', em.validation_results, 'drift_events', em.drift_events, 'status', em.status),
           COALESCE((em.row_counts->>'source_block')::int, 0),
           COALESCE((em.row_counts->>'help_entity')::int, 0),
           COALESCE((em.row_counts->>'workflow_pipeline')::int, 0),
           COALESCE((em.row_counts->>'accountability_route')::int, 0),
           COALESCE((em.row_counts->>'entity_override')::int, 0),
           COALESCE((em.row_counts->>'term_definition')::int, 0),
           CASE WHEN em.source_hash LIKE '%:%' THEN split_part(em.source_hash, ':', 1) ELSE NULL END,
           em.status,
           em.executed_at
      INTO v_manifest_id, v_manifest, v_total_source_blocks, v_total_entities_extracted, v_total_workflows_extracted, v_total_accountability_routes, v_total_overrides, v_total_definitions, v_hash_algorithm, v_validation_status, v_manifest_created_at
      FROM public.extraction_manifest em
     WHERE em.extraction_run_id = v_run.extraction_run_id
     ORDER BY em.executed_at DESC NULLS LAST, em.id DESC
     LIMIT 1;

    IF v_manifest IS NULL THEN v_manifest := '{}'::jsonb; END IF;
    v_validation_status := COALESCE(v_validation_status, v_run.extraction_status);
  EXCEPTION WHEN OTHERS THEN
    v_layer_query_failed := true; v_errors := array_append(v_errors, 'extraction_manifest_query_failed'); v_missing_layers := array_append(v_missing_layers, 'extraction_manifest'); v_manifest := '{}'::jsonb; v_validation_status := v_run.extraction_status;
  END;

  v_cov_protections := CASE WHEN v_protections_count > 0 THEN 'available' ELSE 'empty' END;
  v_cov_workflow := CASE WHEN v_workflow_count > 0 THEN 'available' ELSE 'empty' END;
  v_cov_accountability := CASE WHEN v_accountability_count > 0 THEN 'available' ELSE 'empty' END;
  v_cov_overrides := CASE WHEN v_overrides_count > 0 THEN 'available' ELSE 'empty' END;
  v_cov_definitions := CASE WHEN v_definitions_count > 0 THEN 'available' ELSE 'empty' END;

  IF EXISTS (SELECT 1 FROM public.layer_coverage lc WHERE lc.extraction_run_id = v_run.extraction_run_id AND lower(COALESCE(lc.layer_name, '')) IN ('help','protections','entities') AND lower(COALESCE(lc.coverage_status, '')) IN ('partial', 'incomplete') AND v_protections_count > 0) THEN v_cov_protections := 'partial'; END IF;
  IF EXISTS (SELECT 1 FROM public.layer_coverage lc WHERE lc.extraction_run_id = v_run.extraction_run_id AND lower(COALESCE(lc.layer_name, '')) = 'workflow' AND lower(COALESCE(lc.coverage_status, '')) IN ('partial', 'incomplete') AND v_workflow_count > 0) THEN v_cov_workflow := 'partial'; END IF;
  IF EXISTS (SELECT 1 FROM public.layer_coverage lc WHERE lc.extraction_run_id = v_run.extraction_run_id AND lower(COALESCE(lc.layer_name, '')) = 'accountability' AND lower(COALESCE(lc.coverage_status, '')) IN ('partial', 'incomplete') AND v_accountability_count > 0) THEN v_cov_accountability := 'partial'; END IF;
  IF EXISTS (SELECT 1 FROM public.layer_coverage lc WHERE lc.extraction_run_id = v_run.extraction_run_id AND lower(COALESCE(lc.layer_name, '')) = 'overrides' AND lower(COALESCE(lc.coverage_status, '')) IN ('partial', 'incomplete') AND v_overrides_count > 0) THEN v_cov_overrides := 'partial'; END IF;
  IF EXISTS (SELECT 1 FROM public.layer_coverage lc WHERE lc.extraction_run_id = v_run.extraction_run_id AND lower(COALESCE(lc.layer_name, '')) = 'definitions' AND lower(COALESCE(lc.coverage_status, '')) IN ('partial', 'incomplete') AND v_definitions_count > 0) THEN v_cov_definitions := 'partial'; END IF;

  v_any_data := (v_protections_count + v_workflow_count + v_accountability_count + v_definitions_count + v_overrides_count) > 0;
  IF NOT v_any_data THEN
    v_availability := 'unavailable'; v_errors := array_append(v_errors, 'no_rosetta_layers_populated');
  ELSIF v_layer_query_failed OR v_cov_protections = 'partial' OR v_cov_workflow = 'partial' OR v_cov_accountability = 'partial' OR v_cov_overrides = 'partial' OR v_cov_definitions = 'partial' THEN
    v_availability := 'partial';
  ELSE
    v_availability := 'available';
  END IF;

  RETURN jsonb_build_object(
    'identity', jsonb_build_object('extraction_run_id', v_run.extraction_run_id, 'corpus_id', v_run.corpus_id, 'source_document_id', v_run.source_document_id, 'canon_version', v_run.canon_version, 'statute_ref', v_run.statute_ref, 'jurisdiction', v_run.jurisdiction),
    'lookup_resolution', jsonb_build_object(
      'method', v_method,
      'priority', v_priority,
      'input', jsonb_build_object('corpus_id', p_corpus_id, 'statute_ref', p_statute_ref, 'jurisdiction', p_jurisdiction, 'extraction_run_id', p_extraction_run_id),
      'resolved', jsonb_build_object('corpus_id', v_run.corpus_id, 'source_document_id', v_run.source_document_id, 'extraction_run_id', v_run.extraction_run_id, 'statute_ref', v_run.statute_ref, 'jurisdiction', v_run.jurisdiction)
    ),
    'law_view', jsonb_build_object(
      'matched_law', v_matched_law,
      'protections', v_protections,
      'workflow_pipelines', v_workflow_pipelines,
      'accountability_routes', v_accountability_routes,
      'definitions', v_definitions,
      'overrides', v_overrides,
      'provenance', jsonb_build_object(
        'source_documents', v_matched_law,
        'source_blocks', '[]'::jsonb,
        'hashes', CASE WHEN v_hash_algorithm IS NOT NULL THEN jsonb_build_array(jsonb_build_object('source_hash', v_manifest->>'source_hash')) ELSE '[]'::jsonb END,
        'extraction_manifest', v_manifest,
        'layer_coverage', v_layer_coverage,
        'extraction_run_id', v_run.extraction_run_id,
        'canon_version', v_run.canon_version,
        'validation_status', v_validation_status,
        'total_source_blocks', COALESCE(v_total_source_blocks, 0),
        'total_entities_extracted', COALESCE(v_total_entities_extracted, 0),
        'total_workflows_extracted', COALESCE(v_total_workflows_extracted, 0),
        'total_accountability_routes', COALESCE(v_total_accountability_routes, 0),
        'total_overrides', COALESCE(v_total_overrides, 0),
        'total_definitions', COALESCE(v_total_definitions, 0),
        'hash_algorithm', v_hash_algorithm
      )
    ),
    'coverage', jsonb_build_object('protections', v_cov_protections, 'workflow', v_cov_workflow, 'accountability', v_cov_accountability, 'overrides', v_cov_overrides, 'definitions', v_cov_definitions),
    'context', jsonb_build_object('rosetta_extraction_run_id', v_run.extraction_run_id, 'rosetta_canon_version', v_run.canon_version),
    'availability', jsonb_build_object('rosetta', v_availability, 'missing_inputs', to_jsonb(v_missing_inputs), 'missing_layers', to_jsonb(v_missing_layers), 'errors', to_jsonb(v_errors)),
    'candidates', v_candidates
  );
END;
$function$

revoke all on function public.get_rosetta_law_view(integer,text,text,integer) from public, anon, authenticated

grant execute on function public.get_rosetta_law_view(integer,text,text,integer) to service_role

-- Pre-ledger public-read policies
create policy allow_public_read on public.accountability_route for select to public using (true)

create policy allow_public_read on public.actor_alias for select to public using (true)

create policy allow_public_read on public.actor_canon for select to public using (true)

create policy allow_public_read on public.appeal_pathway for select to public using (true)

create policy allow_public_read on public.corpus for select to public using (true)

create policy allow_public_read on public.entity_override for select to public using (true)

create policy allow_public_read on public.escalation_node for select to public using (true)

create policy allow_public_read on public.extraction_drift_log for select to public using (true)

create policy allow_public_read on public.extraction_manifest for select to public using (true)

create policy allow_public_read on public.extraction_run for select to public using (true)

create policy allow_public_read on public.extraction_run_config for select to public using (true)

create policy allow_public_read on public.help_entity for select to public using (true)

create policy allow_public_read on public.hr1_raw_blocks for select to public using (true)

create policy allow_public_read on public.layer_coverage for select to public using (true)

create policy allow_public_read on public.source_document for select to public using (true)

create policy allow_public_read on public.term_definition for select to public using (true)

create policy allow_public_read on public.term_definition_affected_steps for select to public using (true)

create policy allow_public_read on public.validation_result for select to public using (true)

create policy allow_public_read on public.workflow_pipeline for select to public using (true)

create policy allow_public_read on public.workflow_step for select to public using (true)
