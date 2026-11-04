-- =====================================================================
-- PROPOSAL (not yet a migration): signal gate, UUID era
-- Prepared 2026-11-04 from the live production definitions.
--
-- The defect (reproduced live, rolled back):
--   evaluate_and_promote_signal(uuid, ...) — the promotion entry point
--   shaped for the current live_data_signals table — calls
--   process_live_signal_through_gate with that uuid, but the gate
--   exists only in an integer-id form (the detected_signals era), so
--   every call fails: ERROR 42883 function
--   process_live_signal_through_gate(uuid, ...) does not exist.
--   Nothing else calls the entry point either (no TS caller, no
--   trigger), so bridged candidates are never gate-evaluated.
--
-- This proposal, in order:
--   1. sunam_gate_log.live_signal_id integer -> text (lossless: the
--      1,214 historical integer ids render identically as text; the
--      column is a log reference only — the gate's decision is
--      computed from signal content, never from the id).
--   2. The gate itself, re-created with a text id. Its body is the
--      live body byte-for-byte except the signature line (generated,
--      diff-verified) — no scoring rule changes.
--   3. The legacy integer signature re-created as a delegating shim,
--      so the two database-internal legacy callers keep resolving.
--   4. evaluate_and_promote_signal re-created from its live def with
--      the single change that its gate call casts the id to text.
--      Its promote_gate_signal call is untouched (already uuid-era).
-- =====================================================================

-- 1. The gate log's id reference becomes era-agnostic.
ALTER TABLE public.sunam_gate_log
    ALTER COLUMN live_signal_id TYPE text USING live_signal_id::text;

-- 2. The gate, text-id form (body identical to the live integer form).
CREATE OR REPLACE FUNCTION public.process_live_signal_through_gate(p_live_signal_id text, p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_dataset_id text, p_confidence_score numeric, p_severity text, p_detected_at timestamp with time zone, p_source_url text, p_generation_method text, p_record_origin text, p_verification_status text, p_evidence_payload jsonb, p_provenance_metadata jsonb, p_raw_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_profile               threshold_profiles%ROWTYPE;
    v_gate_log_id           UUID;
    v_gate_hash             TEXT;
    v_signal_hash           TEXT;
    v_payload_hash          TEXT;
    v_decision_hash         TEXT;
    v_composite_score       NUMERIC(5,4);
    v_decision              gate_decision;
    v_decision_reason       TEXT;
    v_escalation_trigger    TEXT;

    v_score_source_trust    NUMERIC(5,4) := 0;
    v_score_temporal        NUMERIC(5,4) := 0;
    v_score_jurisdiction    NUMERIC(5,4) := 0;
    v_score_schema          NUMERIC(5,4) := 0;
    v_score_extraction      NUMERIC(5,4) := 0;
    v_score_provenance      NUMERIC(5,4) := 0;
    v_score_duplicate       NUMERIC(5,4) := 1.0;
    v_score_contradiction   NUMERIC(5,4) := 1.0;

    v_age_days              NUMERIC;
    v_score_breakdown       JSONB;
    v_input_snapshot        JSONB;
    v_existing_gate_log_id  UUID;
BEGIN
    -- Compute deterministic signal hash (6-param signature)
    v_signal_hash := compute_signal_hash(
        p_signal_type, p_source_system, p_source_connector_id,
        p_jurisdiction_raw_value, p_detected_at,
        COALESCE(p_raw_payload, '{}'::JSONB)
    );

    -- Idempotency check
    SELECT gate_log_id INTO v_existing_gate_log_id
    FROM sunam_gate_log WHERE signal_hash = v_signal_hash LIMIT 1;

    IF v_existing_gate_log_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'gate_log_id', gate_log_id, 'decision', decision::TEXT,
            'composite_score', composite_score, 'profile_name', profile_name,
            'decision_reason', decision_reason, 'gate_hash', gate_hash,
            'signal_hash', signal_hash, 'payload_hash', payload_hash,
            'decision_hash', decision_hash, 'score_breakdown', score_breakdown,
            'escalation_trigger', escalation_trigger, 'idempotent', TRUE
        ) INTO v_score_breakdown
        FROM sunam_gate_log WHERE gate_log_id = v_existing_gate_log_id;
        RETURN v_score_breakdown;
    END IF;

    -- Resolve threshold profile
    v_profile := resolve_threshold_profile(p_dataset_id, p_source_connector_id, p_source_system);
    v_payload_hash := md5(COALESCE(p_raw_payload::TEXT, '{}'));

    -- Source trust tier
    v_score_source_trust := CASE
        WHEN p_source_system IN ('open_states','court_listener','pro_publica','census','bls','hud') THEN 1.0
        WHEN p_source_system IN ('grants_gov','usaspending','cfpb','epa','osha','fec','sec') THEN 0.85
        WHEN p_source_system IN ('atlas','luminari_canonical_registry') THEN 0.9
        WHEN p_source_system IS NULL OR p_source_system = '' OR p_source_system = 'unknown' THEN 0.1
        ELSE 0.5
    END;

    -- Temporal relevance
    IF p_detected_at IS NOT NULL THEN
        v_age_days := EXTRACT(EPOCH FROM (NOW() - p_detected_at)) / 86400.0;
        v_score_temporal := CASE
            WHEN v_age_days < 1   THEN 1.0
            WHEN v_age_days < 7   THEN 0.9
            WHEN v_age_days < 30  THEN 0.75
            WHEN v_age_days < 90  THEN 0.5
            WHEN v_age_days < 365 THEN 0.3
            ELSE 0.1
        END;
    ELSE
        v_score_temporal := 0.2;
    END IF;

    -- Jurisdiction validity
    v_score_jurisdiction := CASE
        WHEN p_jurisdiction_raw_value IS NOT NULL AND p_jurisdiction_raw_value != ''
             AND p_jurisdiction_raw_value ~ '^us(-[a-z]{2}(-[a-z0-9]+)?)?$' THEN 1.0
        WHEN p_jurisdiction_raw_value IS NOT NULL AND p_jurisdiction_raw_value != '' THEN 0.5
        ELSE 0.0
    END;

    -- Schema validity
    v_score_schema := CASE
        WHEN p_signal_type IS NOT NULL AND p_signal_type != ''
             AND p_source_system IS NOT NULL AND p_source_system != ''
             AND p_confidence_score IS NOT NULL
             AND p_confidence_score BETWEEN 0 AND 1 THEN 1.0
        WHEN p_signal_type IS NOT NULL AND p_signal_type != '' THEN 0.5
        ELSE 0.0
    END;

    -- Extraction completeness
    v_score_extraction := (
        CASE WHEN p_signal_type IS NOT NULL AND p_signal_type != '' THEN 1 ELSE 0 END +
        CASE WHEN p_source_url IS NOT NULL AND p_source_url != '' THEN 1 ELSE 0 END +
        CASE WHEN p_generation_method IS NOT NULL AND p_generation_method != '' THEN 1 ELSE 0 END +
        CASE WHEN p_jurisdiction_raw_value IS NOT NULL AND p_jurisdiction_raw_value != '' THEN 1 ELSE 0 END +
        CASE WHEN p_evidence_payload IS NOT NULL AND p_evidence_payload != '{}'::JSONB THEN 1 ELSE 0 END +
        CASE WHEN p_provenance_metadata IS NOT NULL AND p_provenance_metadata != '{}'::JSONB THEN 1 ELSE 0 END +
        CASE WHEN p_verification_status IS NOT NULL AND p_verification_status != '' THEN 1 ELSE 0 END +
        CASE WHEN p_record_origin IS NOT NULL AND p_record_origin != '' THEN 1 ELSE 0 END
    )::NUMERIC / 8.0;

    -- Provenance confidence
    v_score_provenance := CASE
        WHEN p_verification_status = 'verified'
             AND p_generation_method IN ('deterministic_extraction','deterministic_rule','rule_based_extraction') THEN 1.0
        WHEN p_verification_status = 'verified' THEN 0.8
        WHEN p_generation_method IN ('deterministic_extraction','deterministic_rule') THEN 0.7
        WHEN p_verification_status = 'unverified' THEN 0.4
        WHEN p_verification_status IS NULL THEN 0.2
        ELSE 0.5
    END;

    -- Duplicate check
    IF EXISTS (
        SELECT 1 FROM detected_signals
        WHERE signal_type = p_signal_type
          AND jurisdiction_raw_value = p_jurisdiction_raw_value
          AND source_url = p_source_url
          AND detected_at = p_detected_at
    ) THEN
        v_score_duplicate := 0.0;
    ELSE
        v_score_duplicate := 1.0;
    END IF;

    -- Composite score
    v_composite_score := ROUND((
        (v_score_source_trust  * v_profile.weight_source_trust_tier)      +
        (v_score_temporal      * v_profile.weight_temporal_relevance)      +
        (v_score_jurisdiction  * v_profile.weight_jurisdiction_validity)   +
        (v_score_schema        * v_profile.weight_schema_validity)         +
        (v_score_extraction    * v_profile.weight_extraction_completeness) +
        (v_score_provenance    * v_profile.weight_provenance_confidence)   +
        (v_score_duplicate     * v_profile.weight_duplicate_probability)   +
        (v_score_contradiction * v_profile.weight_contradiction_flags)
    )::NUMERIC, 4);

    -- Decision routing
    IF v_composite_score >= v_profile.promote_threshold THEN
        v_decision := 'PROMOTE';
        v_decision_reason := 'Score ' || ROUND(v_composite_score,4)::TEXT || ' >= promote threshold ' || ROUND(v_profile.promote_threshold,4)::TEXT || '.';
    ELSIF v_composite_score >= v_profile.stage_threshold THEN
        v_decision := 'STAGE';
        v_decision_reason := 'Score ' || ROUND(v_composite_score,4)::TEXT || ' >= stage threshold ' || ROUND(v_profile.stage_threshold,4)::TEXT || '.';
    ELSIF v_composite_score >= v_profile.hold_threshold THEN
        v_decision := 'HOLD';
        v_decision_reason := 'Score ' || ROUND(v_composite_score,4)::TEXT || ' >= hold threshold ' || ROUND(v_profile.hold_threshold,4)::TEXT || '.';
    ELSE
        v_decision := 'REJECT';
        v_decision_reason := 'Score ' || ROUND(v_composite_score,4)::TEXT || ' below hold threshold ' || ROUND(v_profile.hold_threshold,4)::TEXT || '.';
    END IF;

    -- Escalation overrides
    IF v_score_duplicate = 0.0 THEN
        v_decision := 'REJECT';
        v_escalation_trigger := 'exact_duplicate';
        v_decision_reason := 'Exact duplicate in detected_signals.';
    END IF;

    IF v_profile.escalate_on_zero_provenance AND v_score_provenance = 0.0 THEN
        v_decision := 'ESCALATE_REVIEW';
        v_escalation_trigger := 'zero_provenance';
        v_decision_reason := 'Zero provenance confidence triggers escalation.';
    END IF;

    IF v_profile.escalate_on_unknown_source AND (p_source_system IS NULL OR p_source_system = 'unknown') THEN
        v_decision := 'ESCALATE_REVIEW';
        v_escalation_trigger := 'unknown_source';
        v_decision_reason := 'Unknown source system triggers escalation.';
    END IF;

    -- Score breakdown JSONB
    v_score_breakdown := jsonb_build_object(
        'profile_used', v_profile.profile_name,
        'promote_threshold', v_profile.promote_threshold,
        'stage_threshold', v_profile.stage_threshold,
        'hold_threshold', v_profile.hold_threshold,
        'composite_score', v_composite_score,
        'source_trust_tier', jsonb_build_object('score', v_score_source_trust, 'weight', v_profile.weight_source_trust_tier),
        'temporal_relevance', jsonb_build_object('score', v_score_temporal, 'weight', v_profile.weight_temporal_relevance),
        'jurisdiction_validity', jsonb_build_object('score', v_score_jurisdiction, 'weight', v_profile.weight_jurisdiction_validity),
        'schema_validity', jsonb_build_object('score', v_score_schema, 'weight', v_profile.weight_schema_validity),
        'extraction_completeness', jsonb_build_object('score', v_score_extraction, 'weight', v_profile.weight_extraction_completeness),
        'provenance_confidence', jsonb_build_object('score', v_score_provenance, 'weight', v_profile.weight_provenance_confidence),
        'duplicate_probability', jsonb_build_object('score', v_score_duplicate, 'weight', v_profile.weight_duplicate_probability),
        'contradiction_flags', jsonb_build_object('score', v_score_contradiction, 'weight', v_profile.weight_contradiction_flags)
    );

    -- Input snapshot for audit
    v_input_snapshot := jsonb_build_object(
        'signal_type', p_signal_type, 'source_system', p_source_system,
        'source_connector_id', p_source_connector_id, 'jurisdiction_raw_value', p_jurisdiction_raw_value,
        'dataset_id', p_dataset_id, 'confidence_score', p_confidence_score,
        'severity', p_severity, 'detected_at', p_detected_at,
        'source_url', p_source_url, 'generation_method', p_generation_method,
        'record_origin', p_record_origin, 'verification_status', p_verification_status
    );

    v_gate_hash     := md5(v_signal_hash || v_decision::TEXT || v_composite_score::TEXT || NOW()::TEXT);
    v_decision_hash := md5(v_decision::TEXT || v_composite_score::TEXT || v_decision_reason);

    -- Insert into sunam_gate_log using actual column names
    INSERT INTO sunam_gate_log (
        live_signal_id,
        signal_type, source_system, source_connector_id,
        jurisdiction_raw_value, dataset_id,
        signal_hash, payload_hash, gate_hash, decision_hash,
        profile_name,
        score_source_trust_tier, score_temporal_relevance, score_jurisdiction_validity,
        score_schema_validity, score_extraction_completeness, score_provenance_confidence,
        score_duplicate_probability, score_contradiction_flags,
        composite_score, decision, decision_reason,
        score_breakdown, input_snapshot, escalation_trigger, evaluated_at
    ) VALUES (
        p_live_signal_id,
        p_signal_type, p_source_system, p_source_connector_id,
        p_jurisdiction_raw_value, p_dataset_id,
        v_signal_hash, v_payload_hash, v_gate_hash, v_decision_hash,
        v_profile.profile_name,
        v_score_source_trust, v_score_temporal, v_score_jurisdiction,
        v_score_schema, v_score_extraction, v_score_provenance,
        v_score_duplicate, v_score_contradiction,
        v_composite_score, v_decision, v_decision_reason,
        v_score_breakdown, v_input_snapshot, v_escalation_trigger, NOW()
    )
    RETURNING gate_log_id INTO v_gate_log_id;

    -- Route non-PROMOTE decisions to extraction_staging
    IF v_decision IN ('STAGE', 'HOLD', 'ESCALATE_REVIEW') THEN
        INSERT INTO extraction_staging (
            gate_log_id, decision, signal_type, source_system,
            jurisdiction_raw_value, confidence_score, severity,
            staging_reason, signal_payload
        ) VALUES (
            v_gate_log_id, v_decision, p_signal_type, p_source_system,
            p_jurisdiction_raw_value, p_confidence_score, p_severity,
            v_decision_reason,
            COALESCE(p_raw_payload, '{}'::JSONB)
        );
    END IF;

    RETURN jsonb_build_object(
        'gate_log_id', v_gate_log_id, 'decision', v_decision::TEXT,
        'composite_score', v_composite_score, 'profile_name', v_profile.profile_name,
        'decision_reason', v_decision_reason, 'gate_hash', v_gate_hash,
        'signal_hash', v_signal_hash, 'payload_hash', v_payload_hash,
        'decision_hash', v_decision_hash, 'score_breakdown', v_score_breakdown,
        'escalation_trigger', v_escalation_trigger, 'idempotent', FALSE
    );

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Gate processing failed for signal_type=% source_system=%: %',
        p_signal_type, p_source_system, SQLERRM;
END;
$function$;


-- 3. The legacy integer signature, as a delegating shim.
CREATE OR REPLACE FUNCTION public.process_live_signal_through_gate(p_live_signal_id integer, p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_dataset_id text, p_confidence_score numeric, p_severity text, p_detected_at timestamp with time zone, p_source_url text, p_generation_method text, p_record_origin text, p_verification_status text, p_evidence_payload jsonb, p_provenance_metadata jsonb, p_raw_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- UUID-era delegation shim: the scoring body lives only in the
    -- text-id overload below. Legacy integer-era callers
    -- (detect_signals_from_stream, enforce_gate_log_on_detected_signals)
    -- keep resolving through this signature.
    RETURN public.process_live_signal_through_gate(p_live_signal_id::text, p_signal_type, p_source_system, p_source_connector_id, p_jurisdiction_raw_value, p_dataset_id, p_confidence_score, p_severity, p_detected_at, p_source_url, p_generation_method, p_record_origin, p_verification_status, p_evidence_payload, p_provenance_metadata, p_raw_payload);
END;
$function$;

-- 4. The promotion entry point, gate call cast to text.
CREATE OR REPLACE FUNCTION public.evaluate_and_promote_signal(p_live_signal_id uuid, p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_dataset_id text, p_confidence_score numeric, p_severity text, p_signal_status text, p_detected_at timestamp with time zone, p_source_url text, p_generation_method text, p_rule_id text, p_rule_version text, p_record_origin text, p_verification_status text, p_evidence_payload jsonb, p_provenance_metadata jsonb, p_raw_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_gate_result   JSONB;
    v_promo_result  JSONB;
    v_gate_log_id   UUID;
    v_decision      TEXT;
BEGIN
    -- Run the gate
    v_gate_result := process_live_signal_through_gate(
        p_live_signal_id::text, p_signal_type, p_source_system, p_source_connector_id,
        p_jurisdiction_raw_value, p_dataset_id, p_confidence_score, p_severity,
        p_detected_at, p_source_url, p_generation_method, p_record_origin,
        p_verification_status, p_evidence_payload, p_provenance_metadata, p_raw_payload
    );

    v_gate_log_id := (v_gate_result->>'gate_log_id')::UUID;
    v_decision := v_gate_result->>'decision';

    -- Only promote if decision is PROMOTE
    IF v_decision = 'PROMOTE' THEN
        v_promo_result := promote_gate_signal(
            v_gate_log_id, p_signal_type, p_source_system, p_source_connector_id,
            p_jurisdiction_raw_value, p_confidence_score, p_severity, p_signal_status,
            p_detected_at, p_source_url, p_generation_method, p_rule_id, p_rule_version,
            p_record_origin, p_verification_status, p_evidence_payload, p_provenance_metadata,
            p_live_signal_id
        );
    ELSE
        v_promo_result := jsonb_build_object(
            'status', 'not_promoted',
            'reason', v_decision,
            'decision_reason', v_gate_result->>'decision_reason'
        );
    END IF;

    RETURN jsonb_build_object(
        'gate', v_gate_result,
        'promotion', v_promo_result
    );
END;
$function$;

