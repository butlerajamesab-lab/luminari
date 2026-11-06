-- =====================================================================
-- PROPOSAL 20261105 — signal gate production bridge
-- Status: PROPOSAL ONLY until applied under Alexander's direction.
--
-- Why: the 20261104 era repair landed and verified (PRs #770/#772,
-- applied 2026-11-05), but the first governed execution stopped one
-- layer deeper: the SQL gate/promoter chain was written against a
-- schema generation production does not carry. Verified first-hand
-- 2026-11-05: the gate INSERTs 27 columns into sunam_gate_log
-- expecting a uuid gate_log_id; production's log has 19 columns
-- (integer id) in the TS estate's shape (server/sunam-gate.ts
-- writes exactly that shape); extraction_staging and
-- detected_signals mismatch the same way; only signal_promotion_log
-- matches the SQL era. A rolled-back probe failed with
-- `column "gate_log_id" does not exist`; no data changed.
--
-- This bridge adapts the SQL chain to production's tables:
--   1. Two ADDITIVE identity columns (uuid, defaulted,
--      unique where they anchor joins). Existing writers are
--      untouched: every added column has a default or is nullable,
--      and no existing column changes name, type, or meaning.
--      Existing rows receive generated uuids at apply time.
--   2. The gate re-created from its live definition with ONLY its
--      persistence blocks adapted (idempotency read, duplicate
--      check, log insert, staging insert). All scoring weights,
--      thresholds, routing, and escalation code is byte-identical
--      to production's running gate (generator-asserted block
--      swaps; diff audited). The duplicate check loses its
--      source_url predicate — production detected_signals has no
--      source_url column — and matches on type + jurisdiction +
--      detected-at (epoch ms) instead.
--   3. The promoter re-created from its live definition with ONLY
--      its persistence adapted (decision_hash recomputed by the
--      gate's own formula from stored fields; detected_signals
--      written in production shape, linked by gate_decision_id;
--      the gate log back-filled with promoted_signal_id, the TS
--      estate's own convention).
-- AMENDMENT (2026-11-05, before apply — supersedes the first
-- amendment note): public.detected_signals is a UNION VIEW over
-- signal_registry, raw_live_signals, and extraction_staging
-- (through detected_signals_base), verified first-hand via
-- pg_get_viewdef after TWO apply attempts failed safe on
-- `ALTER action ADD COLUMN cannot be performed on views` and
-- rolled back in full — no statement from either attempt persists.
-- Promoted signals surface through the view's extraction_staging
-- branch (signal_id = promoted_signal_id, approval_status =
-- gate_decision), so the promoter's write lands there as a row
-- marked 'promoted'; no identity column is added on the detected
-- side. The gate's duplicate check keeps reading the view. The
-- views' definitions are deliberately untouched.
-- The wrapper, the integer shim, and run_signal_promotion_batch_v1
-- are NOT changed: the gate again returns a real uuid gate_log_id,
-- which is all they ever needed.
-- =====================================================================

-- 1. Additive identity bridges.
ALTER TABLE public.sunam_gate_log
    ADD COLUMN gate_log_id uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX sunam_gate_log_gate_log_id_key
    ON public.sunam_gate_log (gate_log_id);

ALTER TABLE public.extraction_staging
    ADD COLUMN gate_log_id uuid;
CREATE INDEX extraction_staging_gate_log_id_idx
    ON public.extraction_staging (gate_log_id);


-- 2. The gate, production-bridged (body generated from the live def).
CREATE OR REPLACE FUNCTION public.process_live_signal_through_gate(p_live_signal_id text, p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_dataset_id text, p_confidence_score numeric, p_severity text, p_detected_at timestamp with time zone, p_source_url text, p_generation_method text, p_record_origin text, p_verification_status text, p_evidence_payload jsonb, p_provenance_metadata jsonb, p_raw_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_profile               threshold_profiles%ROWTYPE;
    v_gate_log_id           UUID;
    v_gate_log_row_id       BIGINT;
    v_staging_row_id        BIGINT;
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
    -- BRIDGE: the production log carries the content hash in
    -- signal_fingerprint and the row's uuid reference in gate_log_id.
    -- gate_hash/payload_hash/decision_hash/escalation_trigger are not
    -- stored columns in the production shape; they return NULL here
    -- (they are recomputed values, present on the fresh-decision path).
    SELECT gate_log_id INTO v_existing_gate_log_id
    FROM sunam_gate_log WHERE signal_fingerprint = v_signal_hash LIMIT 1;

    IF v_existing_gate_log_id IS NOT NULL THEN
        SELECT jsonb_build_object(
            'gate_log_id', gate_log_id, 'decision', decision::TEXT,
            'composite_score', sunam_score::NUMERIC, 'profile_name', threshold_id,
            'decision_reason', decision_reason, 'gate_hash', NULL,
            'signal_hash', signal_fingerprint, 'payload_hash', NULL,
            'decision_hash', NULL, 'score_breakdown', score_breakdown::JSONB,
            'escalation_trigger', NULL, 'idempotent', TRUE
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
          AND jurisdiction = p_jurisdiction_raw_value
          AND detected_at = (EXTRACT(EPOCH FROM p_detected_at) * 1000)::BIGINT
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

    -- Insert into sunam_gate_log
    -- BRIDGE: production column shape (the TS estate's columns plus
    -- this proposal's gate_log_id, supplied by its default).
    -- sunam_score / threshold_used / score_breakdown follow the
    -- estate's own text conventions; actor marks the writer.
    INSERT INTO sunam_gate_log (
        live_signal_id, signal_fingerprint, signal_type, dataset_id,
        sunam_score, threshold_used, threshold_id, score_breakdown,
        decision, decision_reason, actor, decided_at, created_at
    ) VALUES (
        p_live_signal_id, v_signal_hash, p_signal_type, p_dataset_id,
        v_composite_score::TEXT, v_profile.promote_threshold::TEXT,
        v_profile.profile_name, v_score_breakdown::TEXT,
        v_decision::TEXT, v_decision_reason, 'sql_gate',
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
    RETURNING gate_log_id, id INTO v_gate_log_id, v_gate_log_row_id;

    -- Route non-PROMOTE decisions to extraction_staging
    -- BRIDGE: production column shape + the gate_log_id bridge
    -- column (extraction_staging.live_signal_id is integer-era and
    -- cannot hold the uuid-era id; the staging row joins back to
    -- the gate log — and through it to the candidate — by
    -- gate_log_id). The log row is back-filled with the staging id,
    -- mirroring the TS estate's convention.
    IF v_decision IN ('STAGE', 'HOLD', 'ESCALATE_REVIEW') THEN
        INSERT INTO extraction_staging (
            signal_type, dataset_id, jurisdiction, severity,
            gate_decision, gate_reason, score_breakdown,
            sunam_score, sunam_threshold, signal_fingerprint,
            gate_log_id, staged_at, created_at, updated_at
        ) VALUES (
            p_signal_type, p_dataset_id, p_jurisdiction_raw_value, p_severity,
            v_decision::TEXT, v_decision_reason, v_score_breakdown::TEXT,
            v_composite_score::TEXT, v_profile.promote_threshold::TEXT,
            v_signal_hash, v_gate_log_id,
            (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
            (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
            (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
        )
        RETURNING id INTO v_staging_row_id;

        UPDATE sunam_gate_log SET staging_id = v_staging_row_id
        WHERE id = v_gate_log_row_id;
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

-- 3. The promoter, production-bridged (body generated from the live def).
CREATE OR REPLACE FUNCTION public.promote_gate_signal(p_gate_log_id uuid, p_signal_type text, p_source_system text, p_source_connector_id text, p_jurisdiction_raw_value text, p_confidence_score numeric, p_severity text, p_signal_status text, p_detected_at timestamp with time zone, p_source_url text, p_generation_method text, p_rule_id text, p_rule_version text, p_record_origin text, p_verification_status text, p_evidence_payload jsonb, p_provenance_metadata jsonb, p_live_signal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_gate_log              sunam_gate_log;
    v_detected_signal_id    UUID;
    v_promotion_id          UUID;
    v_promotion_hash        TEXT;
    v_existing_signal_id    UUID;
    v_decision_hash         TEXT;
    v_detected_row_id       BIGINT;
BEGIN
    -- Verify gate log exists and decision is PROMOTE
    SELECT * INTO v_gate_log
    FROM sunam_gate_log
    WHERE gate_log_id = p_gate_log_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Gate log not found: %', p_gate_log_id;
    END IF;

    IF v_gate_log.decision <> 'PROMOTE' THEN
        RAISE EXCEPTION 'Cannot promote signal with gate decision %. Only PROMOTE decisions can be promoted. gate_log_id: %',
            v_gate_log.decision, p_gate_log_id;
    END IF;

    -- BRIDGE: the production log row stores no decision_hash;
    -- recompute it with the gate's own formula from the stored
    -- decision, score, and reason (same inputs, same value).
    v_decision_hash := md5(v_gate_log.decision || v_gate_log.sunam_score || v_gate_log.decision_reason);

    -- Check if already promoted (idempotency)
    SELECT detected_signal_id INTO v_existing_signal_id
    FROM signal_promotion_log
    WHERE gate_log_id = p_gate_log_id
      AND promotion_status = 'promoted';

    IF FOUND THEN
        RETURN jsonb_build_object(
            'promotion_id', NULL,
            'detected_signal_id', v_existing_signal_id,
            'status', 'duplicate',
            'message', 'Signal already promoted via this gate decision.'
        );
    END IF;

    -- Create promotion log entry (pending)
    INSERT INTO signal_promotion_log (
        gate_log_id, decision_hash, live_signal_id,
        signal_type, source_system, jurisdiction_raw_value,
        composite_score, promotion_status
    ) VALUES (
        p_gate_log_id, v_decision_hash, p_live_signal_id,
        p_signal_type, p_source_system, p_jurisdiction_raw_value,
        v_gate_log.sunam_score::NUMERIC, 'pending'
    )
    RETURNING promotion_id INTO v_promotion_id;

    -- Write the promoted signal (the only legitimate write path)
    -- BRIDGE (amended): production detected_signals is a UNION VIEW
    -- (signal_registry + raw_live_signals + extraction_staging);
    -- promoted signals surface through its extraction_staging
    -- branch, keyed by promoted_signal_id, with approval_status
    -- read from gate_decision. So the constitutional write lands
    -- as a staging row marked 'promoted', carrying this module's
    -- generated uuid as promoted_signal_id — the same uuid the
    -- promotion log records as detected_signal_id. staged_at
    -- carries the candidate's own detection time (the view reads
    -- it as detected_at). live_signal_id stays NULL: the staging
    -- column is integer-era; the candidate's uuid is reachable
    -- through gate_log_id -> sunam_gate_log.live_signal_id.
    v_detected_signal_id := gen_random_uuid();
    INSERT INTO extraction_staging (
        signal_type, dataset_id, jurisdiction, severity, title,
        supporting_statistics, raw_confidence_score,
        signal_fingerprint, sunam_score, sunam_threshold,
        score_breakdown, gate_decision, gate_reason,
        promoted_signal_id, promoted_at, gate_log_id,
        staged_at, created_at, updated_at
    ) VALUES (
        p_signal_type, v_gate_log.dataset_id, p_jurisdiction_raw_value,
        p_severity, p_signal_type,
        COALESCE(p_evidence_payload, '{}'::JSONB)::TEXT,
        p_confidence_score::TEXT,
        v_gate_log.signal_fingerprint, v_gate_log.sunam_score,
        v_gate_log.threshold_used, v_gate_log.score_breakdown,
        'promoted', v_gate_log.decision_reason,
        v_detected_signal_id::TEXT,
        to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        p_gate_log_id,
        (EXTRACT(EPOCH FROM COALESCE(p_detected_at, NOW())) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
    RETURNING id INTO v_detected_row_id;

    -- Compute promotion hash
    v_promotion_hash := md5(
        p_gate_log_id::TEXT || '|' || v_detected_signal_id::TEXT
    );

    -- Update promotion log to promoted
    UPDATE signal_promotion_log
    SET
        detected_signal_id = v_detected_signal_id,
        promotion_status = 'promoted',
        promotion_hash = v_promotion_hash,
        promoted_at = NOW(),
        updated_at = NOW()
    WHERE promotion_id = v_promotion_id;

    -- BRIDGE: mirror the TS estate's convention — the gate log
    -- row points at the signal it promoted.
    UPDATE sunam_gate_log
    SET promoted_signal_id = v_detected_signal_id::TEXT
    WHERE gate_log_id = p_gate_log_id;

    RETURN jsonb_build_object(
        'promotion_id', v_promotion_id,
        'detected_signal_id', v_detected_signal_id,
        'promotion_hash', v_promotion_hash,
        'status', 'promoted',
        'gate_log_id', p_gate_log_id,
        'composite_score', v_gate_log.sunam_score::NUMERIC
    );

EXCEPTION WHEN OTHERS THEN
    -- Update promotion log to failed
    IF v_promotion_id IS NOT NULL THEN
        UPDATE signal_promotion_log
        SET promotion_status = 'failed',
            failure_reason = SQLERRM,
            updated_at = NOW()
        WHERE promotion_id = v_promotion_id;
    END IF;

    RAISE EXCEPTION 'Signal promotion failed for gate_log_id=%: %', p_gate_log_id, SQLERRM;
END;
$function$;
