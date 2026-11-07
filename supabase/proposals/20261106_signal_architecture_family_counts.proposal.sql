-- Proposal: per-family classification counts for the legacy signal surface.
-- Implements the determinations of LEGACY-FAMILY-AUDIT-2026-11-06 (Alexander's
-- "Onward", 2026-11-06): the single legacy bucket is decomposed into the
-- families the audit censused. ADDITIVE ONLY: every existing column of
-- v_signal_architecture_integrity is preserved verbatim and in order; five
-- family counts are appended. No data changes.
CREATE OR REPLACE VIEW public.v_signal_architecture_integrity AS
WITH atlas_counts AS (
         SELECT (COALESCE(sum(p.observation_count), (0)::numeric))::bigint AS raw_observation_count,
            (COALESCE(sum(p.identity_bound_observation_count), (0)::numeric))::bigint AS unique_observation_count,
            max(p.latest_observed_at) AS latest_observation_at
           FROM atlas_stream_runtime_projection_v1 p
          WHERE p.is_current
        )
 SELECT raw_observation_count AS atlas_raw_observation_count,
    ( SELECT count(*) AS count
           FROM detected_signals) AS legacy_detected_signals_count,
    ( SELECT count(*) AS count
           FROM live_signals) AS legacy_live_signals_count,
    ( SELECT count(*) AS count
           FROM detected_signals_v2) AS prior_v2_signal_count,
    ( SELECT count(*) AS count
           FROM intake_signals
          WHERE intake_signals.is_current) AS intake_signal_count,
    ( SELECT count(*) AS count
           FROM legal_patterns
          WHERE legal_patterns.is_current) AS legal_pattern_count,
    ( SELECT count(*) AS count
           FROM live_data_signals
          WHERE live_data_signals.is_current) AS live_data_signal_count,
    ( SELECT count(*) AS count
           FROM signal_convergences
          WHERE signal_convergences.is_current) AS convergence_count,
    latest_observation_at AS latest_atlas_observation_at,
    'legacy_detected_signals_are_unclassified_evidence'::text AS legacy_status,
    'current_atlas_runtime_projection_is_operator_observation_truth'::text AS atlas_status,
    unique_observation_count AS atlas_unique_observation_count,
    GREATEST((raw_observation_count - unique_observation_count), (0)::bigint) AS atlas_replay_observation_count,
    ( SELECT count(*) AS count
           FROM live_data_signals
          WHERE (live_data_signals.is_current AND (live_data_signals.governance_status = 'observation_candidate'::text))) AS live_data_candidate_count,
    ( SELECT count(*) AS count
           FROM live_data_signals
          WHERE (live_data_signals.is_current AND (live_data_signals.governance_status = 'promoted'::text))) AS live_data_promoted_count
   ,
    ( SELECT count(*) AS count
           FROM signal_registry
          WHERE signal_registry.signal_type = 'weak_joint'::text) AS cited_legal_analysis_count,
    ( SELECT count(*) AS count
           FROM signal_registry
          WHERE signal_registry.signal_type <> 'weak_joint'::text) AS retired_detector_stub_count,
    ( SELECT count(*) AS count
           FROM raw_live_signals) AS early_source_record_count,
    ( SELECT count(*) AS count
           FROM extraction_staging
          WHERE extraction_staging.gate_decision = 'staged'::text) AS gate_staging_history_count,
    ( SELECT count(*) AS count
           FROM extraction_staging
          WHERE extraction_staging.gate_decision = 'promoted'::text) AS governed_staging_promotion_count
   FROM atlas_counts a;
