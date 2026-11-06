import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Contract test for the signal-gate chain AS IT EXISTS IN PRODUCTION:
 * the 20261104 UUID-era proposals (PRs #770/#772, applied 2026-11-05)
 * plus the 20261105 production bridge proposal.
 *
 * Harness discipline (v2 — corrected after a owned miss): the first
 * version of this suite modeled its tables from the function
 * definitions, so it proved the functions against their own imagined
 * schema while production's tables were a different generation.
 * This harness is built from PRODUCTION's actual definitions,
 * harvested from information_schema on 2026-11-05:
 * - table DDL below is generated from production's column lists
 *   (sunam_gate_log 19 cols, extraction_staging 30, detected_signals
 *   60, signal_promotion_log 16, threshold_profiles 24,
 *   live_data_signals 29 — the TS estate's shapes, pre-bridge);
 * - compute_signal_hash and resolve_threshold_profile are
 *   production's own definitions, verbatim;
 * - threshold_profiles is seeded with production's three real rows;
 * - promote_gate_signal is NOT doubled: the bridge proposal's
 *   promoter is the code under test;
 * - evaluate_and_promote_signal and the integer gate shim are
 *   extracted verbatim from the 20261104 era proposal (the versions
 *   applied to production); the batch caller executes verbatim from
 *   its proposal; the bridge proposal executes verbatim.
 * This harness never touches a Supabase project.
 */

const eraProposal = readFileSync(
  new URL(
    "../supabase/proposals/20261104_signal_gate_uuid_era.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);
const batchProposal = readFileSync(
  new URL(
    "../supabase/proposals/20261104_signal_promotion_batch.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);
const bridgeProposal = readFileSync(
  new URL(
    "../supabase/proposals/20261105_signal_gate_production_bridge.proposal.sql",
    import.meta.url,
  ),
  "utf8",
);

function extractFunction(sql: string, name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
  );
  const m = sql.match(re);
  if (!m) throw new Error(`function ${name} not found in proposal`);
  return m[0];
}

// The wrapper and the integer shim, verbatim from the era proposal.
const wrapperSql = extractFunction(
  eraProposal,
  "evaluate_and_promote_signal",
);
const shimSql = (() => {
  // The era proposal carries two gate definitions (text + integer
  // shim); take the integer one.
  const all = eraProposal.match(
    /CREATE OR REPLACE FUNCTION public\.process_live_signal_through_gate\([\s\S]*?\$function\$;/g,
  );
  if (!all) throw new Error("gate definitions not found");
  const shim = all.find((s) => s.includes("p_live_signal_id integer"));
  if (!shim) throw new Error("integer shim not found");
  return shim;
})();

// The compat view body, extracted from the era proposal itself so
// harness and proposal can never drift.
const compatViewBody = (() => {
  const match = eraProposal.match(
    /CREATE VIEW compat\.sunam_gate_log AS\s+([\s\S]*?);\n/,
  );
  if (!match) throw new Error("proposal carries no compat view body");
  return match[1];
})();

// Production's own auxiliary functions, verbatim (harvested
// 2026-11-05 via pg_get_functiondef).
const computeSignalHashSql = `CREATE OR REPLACE FUNCTION public.compute_signal_hash(p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_detected_at timestamp with time zone, p_raw_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN md5(
        COALESCE(p_signal_type, '') || '|' ||
        COALESCE(p_source_system, '') || '|' ||
        COALESCE(p_source_connector_id, '') || '|' ||
        COALESCE(p_jurisdiction_raw_value, '') || '|' ||
        COALESCE(p_detected_at::TEXT, '') || '|' ||
        COALESCE(p_raw_payload::TEXT, '{}')
    );
END;
$function$`;
const resolveProfileSql = `CREATE OR REPLACE FUNCTION public.resolve_threshold_profile(p_dataset_id text, p_jurisdiction_raw_value text, p_source_tier text)
 RETURNS threshold_profiles
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_profile threshold_profiles;
BEGIN
    -- Try exact match: dataset_id + jurisdiction_scope
    SELECT * INTO v_profile
    FROM threshold_profiles
    WHERE is_active = TRUE
      AND dataset_id = COALESCE(NULLIF(p_dataset_id, ''), NULL)
      AND jurisdiction_scope = p_jurisdiction_raw_value
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN RETURN v_profile; END IF;

    -- Try dataset_id only (no jurisdiction constraint)
    SELECT * INTO v_profile
    FROM threshold_profiles
    WHERE is_active = TRUE
      AND dataset_id = COALESCE(NULLIF(p_dataset_id, ''), NULL)
      AND jurisdiction_scope IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN RETURN v_profile; END IF;

    -- Fall back to global default
    SELECT * INTO v_profile
    FROM threshold_profiles
    WHERE is_active = TRUE AND is_default = TRUE
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No threshold profile found and no global default exists. Cannot evaluate signal.';
    END IF;

    RETURN v_profile;
END;
$function$`;

// Production-shaped harness tables (DDL generated from production
// information_schema, 2026-11-05; pre-bridge state). NOTE:
// detected_signals is a VIEW over detected_signals_base in
// production; the harness models both, from the harvested def.
const harnessDdl = `CREATE TABLE public.threshold_profiles (
      profile_id uuid DEFAULT gen_random_uuid() NOT NULL,
      profile_name text NOT NULL,
      dataset_id text,
      jurisdiction_scope text,
      source_tier text,
      weight_provenance_confidence numeric DEFAULT 0.20 NOT NULL,
      weight_jurisdiction_validity numeric DEFAULT 0.15 NOT NULL,
      weight_source_trust_tier numeric DEFAULT 0.15 NOT NULL,
      weight_duplicate_probability numeric DEFAULT 0.10 NOT NULL,
      weight_extraction_completeness numeric DEFAULT 0.15 NOT NULL,
      weight_temporal_relevance numeric DEFAULT 0.10 NOT NULL,
      weight_schema_validity numeric DEFAULT 0.10 NOT NULL,
      weight_contradiction_flags numeric DEFAULT 0.05 NOT NULL,
      promote_threshold numeric DEFAULT 0.65 NOT NULL,
      stage_threshold numeric DEFAULT 0.40 NOT NULL,
      hold_threshold numeric DEFAULT 0.20 NOT NULL,
      escalate_on_contradiction boolean DEFAULT true NOT NULL,
      escalate_on_zero_provenance boolean DEFAULT true NOT NULL,
      escalate_on_unknown_source boolean DEFAULT false NOT NULL,
      is_default boolean DEFAULT false NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      description text,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.sunam_gate_log (
      id integer DEFAULT nextval('sunam_gate_log_id_seq') NOT NULL,
      decision text,
      threshold text,
      threshold_id text,
      reason text,
      timestamp bigint,
      live_signal_id text,
      signal_fingerprint text,
      signal_type text,
      dataset_id text,
      sunam_score text,
      threshold_used text,
      decision_reason text,
      promoted_signal_id text,
      staging_id integer,
      actor text,
      decided_at bigint,
      created_at bigint,
      score_breakdown text
    );

    CREATE TABLE public.extraction_staging (
      id integer DEFAULT nextval('extraction_staging_id_seq') NOT NULL,
      signal_type text,
      dataset_id text,
      jurisdiction text,
      domain text,
      severity text,
      title text,
      explanation text,
      pattern_summary text,
      supporting_statistics text,
      raw_confidence_score text,
      signal_fingerprint text,
      entity_type text,
      canonical_entity_name text,
      entity_role text,
      live_signal_id integer,
      ingest_run_id text,
      sunam_score text,
      sunam_threshold text,
      score_breakdown text,
      gate_decision text,
      gate_reason text,
      reviewed_by text,
      reviewed_at text,
      review_notes text,
      staged_at bigint,
      promoted_at text,
      promoted_signal_id text,
      created_at bigint,
      updated_at bigint
    );

    CREATE TABLE public.signal_registry (
      id integer DEFAULT nextval('signal_registry_id_seq') NOT NULL,
      signal_type text,
      domain text,
      trigger_patterns text,
      linked_doctrine text,
      linked_weak_joints text,
      linked_contradiction_templates text,
      severity text,
      explanation text,
      recommended_next_steps text,
      added_by text,
      created_at bigint,
      updated_at bigint,
      cluster_id text,
      route_to_pattern_engine integer,
      route_to_strategy_engine integer,
      route_to_procedural_engine integer
    );

    CREATE TABLE public.raw_live_signals (
      id integer DEFAULT nextval('raw_live_signals_id_seq') NOT NULL,
      signal_type text,
      source_id text,
      value text,
      numeric_value text,
      latitude text,
      longitude text,
      metadata text,
      timestamp bigint,
      created_at bigint,
      updated_at bigint
    );

    CREATE TABLE public.signal_promotion_log (
      promotion_id uuid DEFAULT gen_random_uuid() NOT NULL,
      gate_log_id uuid NOT NULL,
      decision_hash text NOT NULL,
      detected_signal_id uuid,
      promotion_status text DEFAULT 'pending'::text NOT NULL,
      promotion_hash text,
      live_signal_id uuid,
      signal_type text NOT NULL,
      source_system text NOT NULL,
      jurisdiction_raw_value text,
      composite_score numeric NOT NULL,
      failure_reason text,
      retry_count integer DEFAULT 0 NOT NULL,
      promoted_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE public.live_data_signals (
      live_data_signal_id uuid DEFAULT gen_random_uuid() NOT NULL,
      signal_type text NOT NULL,
      title text NOT NULL,
      description text NOT NULL,
      primary_stream_id text NOT NULL,
      source_event_refs jsonb NOT NULL,
      entity_ids text[] DEFAULT ARRAY[]::text[] NOT NULL,
      entity_resolution_status text NOT NULL,
      jurisdiction_id text NOT NULL,
      severity text NOT NULL,
      confidence_score numeric NOT NULL,
      verification_state text NOT NULL,
      supporting_statistics jsonb NOT NULL,
      evidence_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
      detection_rule_id text NOT NULL,
      detection_rule_version text NOT NULL,
      engine_id text NOT NULL,
      engine_version text NOT NULL,
      input_hash text NOT NULL,
      signal_hash text NOT NULL,
      source_freshness_at timestamp with time zone NOT NULL,
      detected_at timestamp with time zone NOT NULL,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      governance_status text DEFAULT 'observation_candidate'::text NOT NULL,
      supersedes_id uuid,
      is_current boolean DEFAULT true NOT NULL,
      atlas_candidate_id uuid,
      atlas_candidate_hash text,
      atlas_semantic_key text
    );`;

// Production's detected_signals views, verbatim (pg_get_viewdef):
// detected_signals_base is a UNION over signal_registry,
// raw_live_signals and extraction_staging; detected_signals reads it.
const detectedSignalsBaseView = `CREATE VIEW public.detected_signals_base AS
SELECT id,
    live_signal_id,
    case_id,
    signal_type,
    dataset_id,
    jurisdiction,
    domain,
    severity,
    title,
    explanation,
    pattern_summary,
    supporting_statistics,
    confidence_score_raw,
    sunam_score,
    sunam_threshold_id,
    approval_status,
    approved_at,
    actionable_at,
    detected_at,
    created_at,
    detection_timestamp,
    confidence_score,
    source_record_ids,
    extraction_timestamp,
    data_version,
    jurisdiction_scope,
    severity_level,
    affected_entities,
    entity_id,
    geographic_focus,
    observed_value,
    expected_value,
    threshold_value,
    percentage_change,
    time_window_start,
    time_window_end,
    escalation_status,
    reviewed_by,
    review_notes,
    external_reference_id,
    updated_at,
    entity_role,
    complaint_category,
    complaint_subcategory,
    narrative_actions_taken,
    narrative_reasoning,
    historical_trend_context,
    cross_signal_links,
    deviation,
    pattern_type_id,
    gate_decision_id,
    plain_language_explanation,
    signal_id,
    parent_record_id,
    sunam_status,
    forensic_logic
   FROM ( SELECT (row_number() OVER (ORDER BY u.source_table, u.source_id))::integer AS id,
            u.live_signal_id,
            u.case_id,
            u.signal_type,
            u.dataset_id,
            u.jurisdiction,
            u.domain,
            u.severity,
            u.title,
            u.explanation,
            u.pattern_summary,
            u.supporting_statistics,
            u.confidence_score_raw,
            u.sunam_score,
            u.sunam_threshold_id,
            u.approval_status,
            u.approved_at,
            u.actionable_at,
            u.detected_at,
            u.created_at,
            u.detection_timestamp,
            u.confidence_score,
            u.source_record_ids,
            u.extraction_timestamp,
            u.data_version,
            u.jurisdiction_scope,
            u.severity_level,
            u.affected_entities,
            u.entity_id,
            u.geographic_focus,
            u.observed_value,
            u.expected_value,
            u.threshold_value,
            u.percentage_change,
            u.time_window_start,
            u.time_window_end,
            u.escalation_status,
            u.reviewed_by,
            u.review_notes,
            u.external_reference_id,
            u.updated_at,
            u.entity_role,
            u.complaint_category,
            u.complaint_subcategory,
            u.narrative_actions_taken,
            u.narrative_reasoning,
            u.historical_trend_context,
            u.cross_signal_links,
            u.deviation,
            u.pattern_type_id,
            u.gate_decision_id,
            u.plain_language_explanation,
            u.signal_id,
            u.parent_record_id,
            u.sunam_status,
            u.forensic_logic,
            u.source_table,
            u.source_id
           FROM ( SELECT 'signal_registry'::text AS source_table,
                    (sr.id)::text AS source_id,
                    NULL::text AS live_signal_id,
                    NULL::text AS case_id,
                    sr.signal_type,
                    NULL::text AS dataset_id,
                    NULL::text AS jurisdiction,
                    sr.domain,
                    sr.severity,
                    sr.signal_type AS title,
                    sr.explanation,
                    NULL::text AS pattern_summary,
                    NULL::text AS supporting_statistics,
                    NULL::text AS confidence_score_raw,
                    NULL::text AS sunam_score,
                    NULL::text AS sunam_threshold_id,
                    'registered'::text AS approval_status,
                    NULL::text AS approved_at,
                    NULL::text AS actionable_at,
                    sr.created_at AS detected_at,
                    sr.created_at,
                    sr.created_at AS detection_timestamp,
                    0 AS confidence_score,
                    NULL::text AS source_record_ids,
                    sr.created_at AS extraction_timestamp,
                    NULL::text AS data_version,
                    NULL::text AS jurisdiction_scope,
                    sr.severity AS severity_level,
                    NULL::text AS affected_entities,
                    NULL::text AS entity_id,
                    NULL::text AS geographic_focus,
                    NULL::text AS observed_value,
                    NULL::text AS expected_value,
                    NULL::text AS threshold_value,
                    NULL::text AS percentage_change,
                    NULL::text AS time_window_start,
                    NULL::text AS time_window_end,
                    NULL::text AS escalation_status,
                    NULL::text AS reviewed_by,
                    NULL::text AS review_notes,
                    NULL::text AS external_reference_id,
                    sr.updated_at,
                    NULL::text AS entity_role,
                    NULL::text AS complaint_category,
                    NULL::text AS complaint_subcategory,
                    NULL::text AS narrative_actions_taken,
                    NULL::text AS narrative_reasoning,
                    NULL::text AS historical_trend_context,
                    NULL::text AS cross_signal_links,
                    NULL::text AS deviation,
                    NULL::text AS pattern_type_id,
                    NULL::integer AS gate_decision_id,
                    sr.explanation AS plain_language_explanation,
                    (sr.id)::text AS signal_id,
                    NULL::text AS parent_record_id,
                    NULL::text AS sunam_status,
                    NULL::text AS forensic_logic
                   FROM signal_registry sr
                UNION ALL
                 SELECT 'raw_live_signals'::text AS source_table,
                    (rls.id)::text AS source_id,
                    (rls.id)::text AS live_signal_id,
                    NULL::text AS case_id,
                    rls.signal_type,
                    rls.source_id AS dataset_id,
                    NULL::text AS jurisdiction,
                    NULL::text AS domain,
                    NULL::text AS severity,
                    rls.signal_type AS title,
                    rls.value AS explanation,
                    NULL::text AS pattern_summary,
                    NULL::text AS supporting_statistics,
                    NULL::text AS confidence_score_raw,
                    NULL::text AS sunam_score,
                    NULL::text AS sunam_threshold_id,
                    'live'::text AS approval_status,
                    NULL::text AS approved_at,
                    NULL::text AS actionable_at,
                    rls."timestamp" AS detected_at,
                    rls.created_at,
                    rls."timestamp" AS detection_timestamp,
                    0 AS confidence_score,
                    NULL::text AS source_record_ids,
                    rls.created_at AS extraction_timestamp,
                    NULL::text AS data_version,
                    NULL::text AS jurisdiction_scope,
                    NULL::text AS severity_level,
                    NULL::text AS affected_entities,
                    NULL::text AS entity_id,
                    NULL::text AS geographic_focus,
                    NULL::text AS observed_value,
                    NULL::text AS expected_value,
                    NULL::text AS threshold_value,
                    NULL::text AS percentage_change,
                    NULL::text AS time_window_start,
                    NULL::text AS time_window_end,
                    NULL::text AS escalation_status,
                    NULL::text AS reviewed_by,
                    NULL::text AS review_notes,
                    NULL::text AS external_reference_id,
                    rls.updated_at,
                    NULL::text AS entity_role,
                    NULL::text AS complaint_category,
                    NULL::text AS complaint_subcategory,
                    NULL::text AS narrative_actions_taken,
                    NULL::text AS narrative_reasoning,
                    NULL::text AS historical_trend_context,
                    NULL::text AS cross_signal_links,
                    NULL::text AS deviation,
                    NULL::text AS pattern_type_id,
                    NULL::integer AS gate_decision_id,
                    rls.value AS plain_language_explanation,
                    (rls.id)::text AS signal_id,
                    NULL::text AS parent_record_id,
                    NULL::text AS sunam_status,
                    NULL::text AS forensic_logic
                   FROM raw_live_signals rls
                UNION ALL
                 SELECT 'extraction_staging'::text AS source_table,
                    (es.id)::text AS source_id,
                    (es.live_signal_id)::text AS live_signal_id,
                    NULL::text AS case_id,
                    es.signal_type,
                    es.dataset_id,
                    es.jurisdiction,
                    es.domain,
                    es.severity,
                    es.title,
                    es.explanation,
                    es.pattern_summary,
                    es.supporting_statistics,
                    es.raw_confidence_score AS confidence_score_raw,
                    es.sunam_score,
                    es.sunam_threshold AS sunam_threshold_id,
                    COALESCE(es.gate_decision, 'staged'::text) AS approval_status,
                    es.reviewed_at AS approved_at,
                    NULL::text AS actionable_at,
                    es.staged_at AS detected_at,
                    es.created_at,
                    es.staged_at AS detection_timestamp,
                        CASE
                            WHEN (es.raw_confidence_score ~ '^[0-9]+(\\.[0-9]+)?$'::text) THEN (((es.raw_confidence_score)::numeric * (100)::numeric))::integer
                            ELSE 0
                        END AS confidence_score,
                    NULL::text AS source_record_ids,
                    es.created_at AS extraction_timestamp,
                    NULL::text AS data_version,
                    es.jurisdiction AS jurisdiction_scope,
                    es.severity AS severity_level,
                    NULL::text AS affected_entities,
                    NULL::text AS entity_id,
                    NULL::text AS geographic_focus,
                    NULL::text AS observed_value,
                    NULL::text AS expected_value,
                    NULL::text AS threshold_value,
                    NULL::text AS percentage_change,
                    NULL::text AS time_window_start,
                    NULL::text AS time_window_end,
                    NULL::text AS escalation_status,
                    NULL::text AS reviewed_by,
                    NULL::text AS review_notes,
                    NULL::text AS external_reference_id,
                    es.updated_at,
                    es.entity_role,
                    NULL::text AS complaint_category,
                    NULL::text AS complaint_subcategory,
                    NULL::text AS narrative_actions_taken,
                    NULL::text AS narrative_reasoning,
                    NULL::text AS historical_trend_context,
                    NULL::text AS cross_signal_links,
                    NULL::text AS deviation,
                    NULL::text AS pattern_type_id,
                    NULL::integer AS gate_decision_id,
                    es.explanation AS plain_language_explanation,
                    es.promoted_signal_id AS signal_id,
                    NULL::text AS parent_record_id,
                    es.sunam_score AS sunam_status,
                    NULL::text AS forensic_logic
                   FROM extraction_staging es) u) q;;`;
const detectedSignalsView = `CREATE VIEW public.detected_signals AS
SELECT id,
    live_signal_id,
    case_id,
    signal_type,
    dataset_id,
    jurisdiction,
    domain,
    severity,
    title,
    explanation,
    pattern_summary,
    supporting_statistics,
    confidence_score_raw,
    sunam_score,
    sunam_threshold_id,
    approval_status,
    approved_at,
    actionable_at,
    detected_at,
    created_at,
    detection_timestamp,
    confidence_score,
    source_record_ids,
    extraction_timestamp,
    data_version,
    jurisdiction_scope,
    severity_level,
    affected_entities,
    entity_id,
    geographic_focus,
    observed_value,
    expected_value,
    threshold_value,
    percentage_change,
    time_window_start,
    time_window_end,
    escalation_status,
    reviewed_by,
    review_notes,
    external_reference_id,
    updated_at,
    entity_role,
    complaint_category,
    complaint_subcategory,
    narrative_actions_taken,
    narrative_reasoning,
    historical_trend_context,
    cross_signal_links,
    deviation,
    pattern_type_id,
    gate_decision_id,
    plain_language_explanation,
    signal_id,
    parent_record_id,
    sunam_status,
    forensic_logic,
    NULL::uuid AS finding_id,
    NULL::uuid AS snapshot_id,
    NULL::uuid AS pipeline_run_id,
    explanation AS signal_description
   FROM detected_signals_base b;;`;

// Production's three threshold profiles, verbatim values.
const profileSeed = `INSERT INTO public.threshold_profiles (profile_id, profile_name, dataset_id, jurisdiction_scope, source_tier, weight_provenance_confidence, weight_jurisdiction_validity, weight_source_trust_tier, weight_duplicate_probability, weight_extraction_completeness, weight_temporal_relevance, weight_schema_validity, weight_contradiction_flags, promote_threshold, stage_threshold, hold_threshold, escalate_on_contradiction, escalate_on_zero_provenance, escalate_on_unknown_source, is_default, is_active, description, created_at, updated_at) VALUES
       ('d3b93f03-8f91-4076-8475-02e50240f0e1', 'global_default', NULL, NULL, NULL, '0.2000', '0.1500', '0.1500', '0.1000', '0.1500', '0.1000', '0.1000', '0.0500', '0.6500', '0.4000', '0.2000', true, true, false, true, true, 'Global default threshold profile. All signals not matching a specific dataset/jurisdiction profile use this.', '2026-05-14 02:37:00.578173+00', '2026-05-14 02:37:00.578173+00'),
       ('f488851e-bbf7-4e2c-89d8-124d8e34dbba', 'luminari_canonical_registry', 'luminari_canonical_registry', NULL, 'government', '0.2500', '0.2000', '0.2000', '0.0500', '0.1000', '0.0500', '0.1000', '0.0500', '0.4500', '0.3000', '0.1500', true, true, false, false, true, 'Registry signals are structural/systemic indicators. Single-record, low temporal span, low corroboration are expected.', '2026-05-14 02:37:00.578173+00', '2026-05-14 02:37:00.578173+00'),
       ('90206f11-5614-4b3a-aceb-87dc7f8c57f8', 'atlas_open_states_wa', 'atlas_open_states', 'us-wa', 'government', '0.2000', '0.2000', '0.1500', '0.1000', '0.1500', '0.1000', '0.0500', '0.0500', '0.6000', '0.3800', '0.1800', true, true, false, false, true, 'Open States Washington legislative signals. Government source, deterministic extraction.', '2026-05-14 02:37:00.578173+00', '2026-05-14 02:37:00.578173+00');`;

let database: PGlite;

const CANDIDATE_FRESH = "aa000000-0000-4000-8000-000000000001";
const CANDIDATE_STALE = "aa000000-0000-4000-8000-000000000002";
const CANDIDATE_DIRECT = "aa000000-0000-4000-8000-000000000003";

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TYPE public.gate_decision AS ENUM
      ('PROMOTE','STAGE','HOLD','REJECT','ESCALATE_REVIEW');
    CREATE SEQUENCE public.sunam_gate_log_id_seq;
    CREATE SEQUENCE public.extraction_staging_id_seq;
    CREATE SEQUENCE public.signal_registry_id_seq;
    CREATE SEQUENCE public.raw_live_signals_id_seq;
  `);
  await database.exec(harnessDdl);
  await database.exec(detectedSignalsBaseView);
  await database.exec(detectedSignalsView);
  await database.exec(
    `CREATE SCHEMA compat; CREATE VIEW compat.sunam_gate_log AS ${compatViewBody};`,
  );
  await database.exec(computeSignalHashSql);
  await database.exec(resolveProfileSql);
  await database.exec(profileSeed);

  // A pre-bridge gate-log row in the TS estate's exact write shape
  // (the column list of logGateDecision in server/sunam-gate.ts).
  await database.query(`
    INSERT INTO public.sunam_gate_log
      (live_signal_id, signal_fingerprint, signal_type, dataset_id,
       sunam_score, threshold_used, score_breakdown,
       decision, decision_reason, promoted_signal_id, staging_id,
       actor, decided_at, created_at)
    VALUES
      ('30059', '818c671380e0117c71094f8e44e8453c', 'registry_structural',
       'registry', '0.5275', '0.4000', '{}',
       'approve', 'Score 0.5275 >= threshold 0.4000 (config: registry_structural)',
       'sig-spkfpteeql3b', NULL, NULL, 1779000000000, 1779000000000)
  `);

  // The era's live pieces: wrapper + integer shim (the era's own
  // gate is superseded by the bridge gate below).
  await database.exec(wrapperSql);
  await database.exec(shimSql);
  // The governed batch caller, verbatim.
  await database.exec(batchProposal);
  // The bridge: additive identity columns + bridged gate + promoter.
  await database.exec(bridgeProposal);

  // Candidates in production live_data_signals shape (CFPB current).
  await database.query(
    `INSERT INTO public.live_data_signals
       (live_data_signal_id, signal_type, title, description,
        primary_stream_id, jurisdiction_id, severity, confidence_score,
        verification_state, supporting_statistics, evidence_refs,
        source_event_refs, entity_resolution_status,
        detection_rule_id, detection_rule_version,
        engine_id, engine_version, input_hash, signal_hash,
        source_freshness_at, detected_at,
        governance_status, is_current, atlas_candidate_hash,
        atlas_semantic_key)
     VALUES
       ($1, 'cross_jurisdiction_recurrence', 'CFPB recurrence (fresh)',
        'Fresh CFPB cross-jurisdiction recurrence candidate',
        'cfpb_complaints', 'multi_jurisdiction', 'critical', 0.95,
        'unresolved', '{"patternCount": 12}'::jsonb, '[]'::jsonb,
        '["evt-1"]'::jsonb, 'resolved',
        'domain3_population', 'v1',
        'atlas.domain3_population_exact', 'v1', 'input-fresh',
        'signal-fresh', NOW(), NOW(),
        'observation_candidate', true, 'cand-hash-fresh', 'cfpb:fresh'),
       ($2, 'cross_jurisdiction_recurrence', 'OR DOJ recurrence (stale)',
        'Stale OR DOJ recurrence candidate (default-trust stream, 200 days old, unverified)',
        'or_doj_consumer_complaints', 'multi_jurisdiction', 'medium', 0.50,
        'unverified', '{"patternCount": 3}'::jsonb, '[]'::jsonb,
        '["evt-2"]'::jsonb, 'resolved',
        'domain3_population', 'v1',
        'atlas.domain3_population_exact', 'v1', 'input-stale',
        'signal-stale', NOW() - INTERVAL '200 days',
        NOW() - INTERVAL '200 days',
        'observation_candidate', true, 'cand-hash-stale', 'ordoj:stale')`,
    [CANDIDATE_FRESH, CANDIDATE_STALE],
  );
});

afterAll(async () => {
  await database.close();
});

describe("signal gate production bridge", () => {
  it("lands its identity columns additively; existing and TS-shaped rows are unharmed", async () => {
    const legacy = await database.query<{ gate_log_id: string }>(
      `SELECT gate_log_id FROM public.sunam_gate_log
        WHERE live_signal_id = '30059'`,
    );
    expect(legacy.rows).toHaveLength(1);
    expect(legacy.rows[0].gate_log_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // A fresh TS-shaped insert (logGateDecision's column list) still
    // works after the bridge and gains its uuid identity by default.
    const tsInsert = await database.query<{ gate_log_id: string }>(
      `INSERT INTO public.sunam_gate_log
         (live_signal_id, signal_fingerprint, signal_type, dataset_id,
          sunam_score, threshold_used, score_breakdown,
          decision, decision_reason, promoted_signal_id, staging_id,
          actor, decided_at, created_at)
       VALUES ('30060', 'f00df00df00df00df00df00df00df00d', 'registry_structural',
               'registry', '0.3000', '0.4000', '{}', 'reject',
               'Score 0.3000 < threshold 0.4000', NULL, 5, NULL,
               1779000001000, 1779000001000)
       RETURNING gate_log_id`,
    );
    expect(tsInsert.rows[0].gate_log_id).toBeTruthy();

    // TS-shaped staging insert (stageSignal's shape, integer
    // live_signal_id) still works.
    await database.query(
      `INSERT INTO public.extraction_staging
         (signal_type, dataset_id, jurisdiction, severity, gate_decision,
          live_signal_id, staged_at, created_at, updated_at)
       VALUES ('registry_structural', 'registry', 'us-wa', 'medium',
               'staged', 30059, 1779000000000, 1779000000000, 1779000000000)`,
    );
  });

  it("executes the bridged gate scoring body for a text (uuid-era) id and writes a production-shaped log row", async () => {
    const result = await database.query<{ r: any }>(
      `SELECT public.process_live_signal_through_gate(
         $1, 'cross_category_entity', 'sec', 'sec_edgar', 'us-wa',
         'sec_edgar', 0.92, 'high', NOW(), NULL,
         'atlas.domain3_population_exact', 'atlas_bridge', 'unresolved',
         '{"k": 1}'::jsonb, '{"engine_id": "atlas"}'::jsonb,
         '{"title": "direct"}'::jsonb) AS r`,
      [CANDIDATE_DIRECT],
    );
    const gate = result.rows[0].r;
    expect(gate.decision).toBe("PROMOTE");
    expect(gate.idempotent).toBe(false);
    expect(gate.gate_log_id).toBeTruthy();

    const log = await database.query<any>(
      `SELECT * FROM public.sunam_gate_log WHERE gate_log_id = $1`,
      [gate.gate_log_id],
    );
    expect(log.rows).toHaveLength(1);
    const row = log.rows[0];
    expect(row.live_signal_id).toBe(CANDIDATE_DIRECT);
    expect(row.decision).toBe("PROMOTE");
    expect(row.actor).toBe("sql_gate");
    expect(row.threshold_id).toBe("global_default");
    expect(row.signal_fingerprint).toBe(gate.signal_hash);
    expect(Number(row.sunam_score)).toBeCloseTo(
      Number(gate.composite_score),
      4,
    );
    expect(row.staging_id).toBeNull();
  });

  it("runs the batch end to end: fresh candidate promotes through the bridged chain, stale candidate stages", async () => {
    const batch = await database.query<{ r: any }>(
      `SELECT public.run_signal_promotion_batch_v1(25, NULL) AS r`,
    );
    const outcome = batch.rows[0].r;
    expect(outcome.evaluated).toBe(2);
    expect(outcome.tally).toEqual({ PROMOTE: 1, STAGE: 1 });

    const fresh = outcome.decisions.find(
      (d: any) => d.live_data_signal_id === CANDIDATE_FRESH,
    );
    const stale = outcome.decisions.find(
      (d: any) => d.live_data_signal_id === CANDIDATE_STALE,
    );
    expect(fresh.decision).toBe("PROMOTE");
    expect(fresh.promotion_status).toBe("promoted");
    expect(fresh.detected_signal_id).toBeTruthy();
    expect(stale.decision).toBe("STAGE");

    // Promotion log: the SQL-era table, keyed by the bridge uuid.
    const promo = await database.query<any>(
      `SELECT * FROM public.signal_promotion_log
        WHERE gate_log_id = $1`,
      [fresh.gate_log_id],
    );
    expect(promo.rows).toHaveLength(1);
    expect(promo.rows[0].promotion_status).toBe("promoted");
    expect(promo.rows[0].detected_signal_id).toBe(fresh.detected_signal_id);
    expect(promo.rows[0].live_signal_id).toBe(CANDIDATE_FRESH);

    // The gate log row points at the promoted signal (estate
    // convention), and the detected row links back by integer id.
    const logRow = await database.query<any>(
      `SELECT * FROM public.sunam_gate_log WHERE gate_log_id = $1`,
      [fresh.gate_log_id],
    );
    expect(logRow.rows[0].promoted_signal_id).toBe(fresh.detected_signal_id);

    // The promoted record: an extraction_staging row marked
    // 'promoted', carrying the uuid as promoted_signal_id and the
    // gate bridge as gate_log_id.
    const detected = await database.query<any>(
      `SELECT * FROM public.extraction_staging
        WHERE promoted_signal_id = $1`,
      [fresh.detected_signal_id],
    );
    expect(detected.rows).toHaveLength(1);
    expect(detected.rows[0].gate_decision).toBe("promoted");
    expect(detected.rows[0].gate_log_id).toBe(fresh.gate_log_id);
    expect(detected.rows[0].sunam_score).toBe(logRow.rows[0].sunam_score);
    expect(detected.rows[0].signal_fingerprint).toBe(
      logRow.rows[0].signal_fingerprint,
    );

    // And it surfaces through the production union view as a
    // detected signal with approval_status 'promoted'.
    const viaView = await database.query<any>(
      `SELECT signal_id, approval_status FROM public.detected_signals
        WHERE signal_id = $1`,
      [fresh.detected_signal_id],
    );
    expect(viaView.rows).toHaveLength(1);
    expect(viaView.rows[0].approval_status).toBe("promoted");

    // Stale candidate: staging row bridged by gate_log_id, and the
    // log row back-filled with the staging id.
    const staleLog = await database.query<any>(
      `SELECT * FROM public.sunam_gate_log WHERE gate_log_id = $1`,
      [stale.gate_log_id],
    );
    expect(staleLog.rows[0].decision).toBe("STAGE");
    const staging = await database.query<any>(
      `SELECT * FROM public.extraction_staging WHERE gate_log_id = $1`,
      [stale.gate_log_id],
    );
    expect(staging.rows).toHaveLength(1);
    expect(staging.rows[0].gate_decision).toBe("STAGE");
    expect(staleLog.rows[0].staging_id).toBe(staging.rows[0].id);
  });

  it("is idempotent: a second batch run writes nothing new", async () => {
    const before = await database.query<any>(
      `SELECT (SELECT count(*)::int FROM public.sunam_gate_log) AS logs,
              (SELECT count(*)::int FROM public.signal_promotion_log) AS promos,
              (SELECT count(*)::int FROM public.detected_signals) AS detected,
              (SELECT count(*)::int FROM public.extraction_staging) AS staging`,
    );
    const batch = await database.query<{ r: any }>(
      `SELECT public.run_signal_promotion_batch_v1(25, NULL) AS r`,
    );
    expect(batch.rows[0].r.evaluated).toBe(2);
    const after = await database.query<any>(
      `SELECT (SELECT count(*)::int FROM public.sunam_gate_log) AS logs,
              (SELECT count(*)::int FROM public.signal_promotion_log) AS promos,
              (SELECT count(*)::int FROM public.detected_signals) AS detected,
              (SELECT count(*)::int FROM public.extraction_staging) AS staging`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("keeps the legacy integer gate signature resolving through the shim", async () => {
    const result = await database.query<{ r: any }>(
      `SELECT public.process_live_signal_through_gate(
         777, 'legacy_signal', 'cfpb', 'cfpb_complaints', 'us-wa',
         'cfpb_complaints', 0.90, 'high', NOW(), NULL,
         'deterministic_rule', 'atlas_bridge', 'unresolved',
         '{"k": 2}'::jsonb, '{"engine_id": "legacy"}'::jsonb,
         '{"title": "legacy"}'::jsonb) AS r`,
    );
    expect(result.rows[0].r.decision).toBeTruthy();
    const log = await database.query<any>(
      `SELECT decision FROM public.sunam_gate_log
        WHERE live_signal_id = '777'`,
    );
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0].decision).toBe(result.rows[0].r.decision);
  });

  it("serves the bridged rows through the compat view", async () => {
    const viaView = await database.query<any>(
      `SELECT live_signal_id, decision FROM compat.sunam_gate_log
        WHERE live_signal_id = $1`,
      [CANDIDATE_FRESH],
    );
    expect(viaView.rows).toHaveLength(1);
    expect(viaView.rows[0].decision).toBe("PROMOTE");
  });
});
