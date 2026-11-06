-- =====================================================================
-- Proposal: signal promotion write-back (supersession)
-- Date: 2026-11-06
--
-- Problem (diagnosed 2026-11-05, Alexander's screenshot): the Domain 3
-- panel counts live_data_signals rows with governance_status='promoted',
-- but the governed promotion chain (gate -> wrapper -> promoter) never
-- writes back to the candidate row, and live_data_signals is
-- append-only — its immutability guard
-- (guard_signal_architecture_immutable_v1) permits an UPDATE of
-- is_current ONLY and directs writers to "create a superseding record
-- instead". So after the first governed batch (2026-11-05: 25 CFPB
-- candidates evaluated, 9 promoted), the panel still read 0 promoted.
--
-- This proposal follows the architecture's own supersession pattern
-- (register_live_data_signal_v1 + live_data_signal_semantic_transition_v1):
--
--   Part 1 adds apply_signal_promotion_writeback_v1(candidate, gate_log)
--   — insert a promoted superseding row, flip the candidate's
--   is_current, write the transition record. Refuses without a matching
--   'promoted' promotion-log record; idempotent.
--
--   Part 2 re-creates promote_gate_signal from its live (bridged)
--   definition with ONE behavioral addition: on a fresh promotion with
--   a candidate id, it calls the write-back and reports the new row id
--   as 'promoted_live_data_signal_id'. A write-back failure fails the
--   promotion (the promoter's existing exception path marks it
--   'failed'), so a promotion can no longer succeed silently without
--   its write-back.
--
-- Scope notes:
-- - The nine promotions from the 2026-11-05 batch are backfilled by
--   calling Part 1 once per promotion at apply time (a data step,
--   receipted separately, idempotent) — they are the rows in
--   signal_promotion_log with promotion_status='promoted' AND
--   live_signal_id IS NOT NULL.
-- - The seven May-2026 promotion-log rows carry live_signal_id NULL
--   (an earlier era's records; no candidate link survives in the log)
--   and are deliberately NOT backfilled by this proposal.
-- - REJECT/STAGE/HOLD decisions write nothing back; their candidates
--   remain current observation_candidates, as before.
--
-- Rollback: re-create promote_gate_signal from its preserved live
-- definition (promotion-gate-prep/../promotion-writeback-prep/
-- promote_gate_signal.live.sql) and drop the Part 1 function; the
-- superseding rows and transitions are append-only records and would
-- be retired by flipping is_current back under the same guard rules.
-- =====================================================================

-- =====================================================================
-- Part 1 — the write-back.
--
-- A governed promotion (Sunam gate PROMOTE + promote_gate_signal) has,
-- until now, never been written back to the candidate it promoted:
-- live_data_signals is append-only (its immutability guard permits an
-- UPDATE of is_current only), every bridged row keeps
-- governance_status='observation_candidate' forever, and the Domain 3
-- panel — which counts 'promoted' rows — reads 0 no matter how many
-- promotions the gate has executed. This function performs the
-- architecture's own supersession move for one promotion:
--
--   1. flip the is_current flag of the row the promoted row
--      supersedes (the one UPDATE the guard permits — done FIRST,
--      because a partial unique index allows only one current row
--      per atlas_semantic_key);
--   2. insert a superseding row copying the PROMOTED candidate in
--      full (the content the gate actually scored), with
--      governance_status='promoted';
--   3. record the lineage in live_data_signal_semantic_transition_v1
--      with transition_reason 'new_version' — the transition
--      table's own CHECK constraint closes that vocabulary to
--      'new_version' / 'reactivated_version', and a governed
--      promotion becoming current IS a new version of the signal;
--      its governed character is carried by the row's
--      governance_status and the promotion-log chain, not by a
--      reason this table forbids — and a
--      transition_hash computed by the house function over the same
--      object shape register_live_data_signal_v1 uses.
--
-- Governance attaches to the semantic signal, not to one emission:
-- the Atlas bridge re-emits a fresh candidate version every cycle,
-- superseding the last, so by the time a promotion is written back
-- the promoted candidate is usually NOT the current row anymore
-- (verified 2026-11-06: all nine of the 2026-11-05 batch's promoted
-- candidates were already non-current, each semantic key holding
-- exactly one newer current version). The promoted row therefore
-- supersedes the CURRENT row of the candidate's semantic key — the
-- candidate itself when no re-emission has landed yet.
--
-- Hashes: the promoted row's signal_hash is the house projection hash
-- for Atlas-bridged candidates (signal_architecture_hash_v1 over
-- projection_contract + atlas_candidate_hash + atlas_semantic_key +
-- rule/engine identity) extended with governance_status='promoted' —
-- the base projection hash is governance-independent and would collide
-- with the candidate's UNIQUE signal_hash. input_hash is the house
-- hash of the copied record (identity/bookkeeping fields removed,
-- governance_status set to 'promoted'). Both deterministic.
--
-- The function refuses to run without a matching 'promoted' record in
-- signal_promotion_log for the same gate decision and candidate, and
-- it is idempotent: a second call returns the already-written row.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_signal_promotion_writeback_v1(
  p_candidate_id uuid,
  p_gate_log_id uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_candidate       public.live_data_signals;
  v_existing_id     uuid;
  v_new_id          uuid;
  v_signal_hash     text;
  v_input_hash      text;
  v_record          jsonb;
  v_transition_hash text;
  v_displaced_id    uuid;
BEGIN
  SELECT * INTO v_candidate
    FROM public.live_data_signals
   WHERE live_data_signal_id = p_candidate_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion write-back: candidate % not found', p_candidate_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.signal_promotion_log
     WHERE gate_log_id = p_gate_log_id
       AND promotion_status = 'promoted'
       AND live_signal_id = p_candidate_id
  ) THEN
    RAISE EXCEPTION 'promotion write-back: no promoted record for gate_log_id % and candidate %',
      p_gate_log_id, p_candidate_id;
  END IF;

  IF v_candidate.governance_status = 'promoted' THEN
    RETURN p_candidate_id;
  END IF;

  v_record := to_jsonb(v_candidate)
              - 'live_data_signal_id' - 'created_at' - 'is_current'
              - 'supersedes_id' - 'signal_hash' - 'input_hash'
              || jsonb_build_object('governance_status', 'promoted');
  v_input_hash := public.signal_architecture_hash_v1(v_record);

  IF v_candidate.atlas_candidate_hash IS NOT NULL THEN
    v_signal_hash := public.signal_architecture_hash_v1(jsonb_build_object(
      'projection_contract', 'atlas_domain3_candidate_projection_v2',
      'atlas_candidate_hash', v_candidate.atlas_candidate_hash,
      'atlas_semantic_key', v_candidate.atlas_semantic_key,
      'detection_rule_id', v_candidate.detection_rule_id,
      'detection_rule_version', v_candidate.detection_rule_version,
      'engine_id', v_candidate.engine_id,
      'engine_version', v_candidate.engine_version,
      'governance_status', 'promoted'
    ));
  ELSE
    v_signal_hash := v_input_hash;
  END IF;

  -- Idempotent: the promoted row for this candidate version already
  -- exists (its hashes are deterministic functions of the candidate).
  SELECT live_data_signal_id INTO v_existing_id
    FROM public.live_data_signals
   WHERE signal_hash = v_signal_hash;

  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  -- Which row does the promoted row supersede? Governance attaches to
  -- the semantic signal, not to one emission: the bridge re-emits a
  -- fresh candidate version every cycle, superseding the last (on
  -- 2026-11-06 all nine of the batch's promoted candidates were
  -- already non-current, each semantic key holding exactly one newer
  -- current version). The promoted row therefore supersedes the
  -- CURRENT row of the candidate's semantic key — which is the
  -- candidate itself when no re-emission has landed yet. With no
  -- semantic key (or no current row), it supersedes the candidate.
  v_displaced_id := NULL;
  IF v_candidate.atlas_semantic_key IS NOT NULL THEN
    SELECT live_data_signal_id INTO v_displaced_id
      FROM public.live_data_signals
     WHERE atlas_semantic_key = v_candidate.atlas_semantic_key
       AND is_current
     FOR UPDATE;
  END IF;
  IF v_displaced_id IS NULL THEN
    v_displaced_id := p_candidate_id;
  END IF;

  -- Flip first: the partial unique index
  -- live_data_signals_one_current_atlas_semantic_idx allows only one
  -- current row per atlas_semantic_key. The immutability guard permits
  -- an UPDATE of is_current only, which is all this is.
  UPDATE public.live_data_signals
     SET is_current = false
   WHERE live_data_signal_id = v_displaced_id
     AND is_current;

  INSERT INTO public.live_data_signals (
    signal_type, title, description, primary_stream_id, source_event_refs,
    entity_ids, entity_resolution_status, jurisdiction_id, severity,
    confidence_score, verification_state, supporting_statistics, evidence_refs,
    detection_rule_id, detection_rule_version, engine_id, engine_version,
    input_hash, signal_hash, source_freshness_at, detected_at,
    governance_status, supersedes_id, is_current,
    atlas_candidate_id, atlas_candidate_hash, atlas_semantic_key
  ) VALUES (
    v_candidate.signal_type, v_candidate.title, v_candidate.description,
    v_candidate.primary_stream_id, v_candidate.source_event_refs,
    v_candidate.entity_ids, v_candidate.entity_resolution_status,
    v_candidate.jurisdiction_id, v_candidate.severity,
    v_candidate.confidence_score, v_candidate.verification_state,
    v_candidate.supporting_statistics, v_candidate.evidence_refs,
    v_candidate.detection_rule_id, v_candidate.detection_rule_version,
    v_candidate.engine_id, v_candidate.engine_version,
    v_input_hash, v_signal_hash, v_candidate.source_freshness_at,
    v_candidate.detected_at,
    'promoted', v_displaced_id, true,
    v_candidate.atlas_candidate_id, v_candidate.atlas_candidate_hash,
    v_candidate.atlas_semantic_key
  )
  RETURNING live_data_signal_id INTO v_new_id;

  v_transition_hash := public.signal_architecture_hash_v1(jsonb_build_object(
    'semantic_key', v_candidate.atlas_semantic_key,
    'previous_live_data_signal_id', v_displaced_id,
    'current_live_data_signal_id', v_new_id,
    'atlas_candidate_id', v_candidate.atlas_candidate_id,
    'atlas_candidate_hash', v_candidate.atlas_candidate_hash,
    'transition_reason', 'new_version'
  ));

  INSERT INTO public.live_data_signal_semantic_transition_v1 (
    semantic_key, previous_live_data_signal_id, current_live_data_signal_id,
    atlas_candidate_id, atlas_candidate_hash, transition_reason, transition_hash
  ) VALUES (
    v_candidate.atlas_semantic_key, v_displaced_id, v_new_id,
    v_candidate.atlas_candidate_id, v_candidate.atlas_candidate_hash,
    'new_version', v_transition_hash
  );

  RETURN v_new_id;
END;
$function$;

-- =====================================================================
-- Part 2 — promote_gate_signal, re-created from its live bridged
-- definition (harvested 2026-11-06) with the write-back call
-- spliced into its success path. Nothing else differs.
-- =====================================================================

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
    v_promoted_live_id      UUID;
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

    -- WRITE-BACK (2026-11-06): the promotion is not complete until
    -- the candidate's own record says so. Supersede the candidate
    -- with a governance_status='promoted' row so the Domain 3 panel
    -- (and every reader of live_data_signals) can see the promotion.
    -- A failure here fails the whole promotion via the exception
    -- handler below — no silent half-state.
    IF p_live_signal_id IS NOT NULL THEN
        v_promoted_live_id := public.apply_signal_promotion_writeback_v1(
            p_live_signal_id, p_gate_log_id
        );
    END IF;

    RETURN jsonb_build_object(
        'promotion_id', v_promotion_id,
        'detected_signal_id', v_detected_signal_id,
        'promotion_hash', v_promotion_hash,
        'status', 'promoted',
        'gate_log_id', p_gate_log_id,
        'composite_score', v_gate_log.sunam_score::NUMERIC,
        'promoted_live_data_signal_id', v_promoted_live_id
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

