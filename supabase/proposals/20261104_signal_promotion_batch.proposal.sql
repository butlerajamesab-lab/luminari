-- =====================================================================
-- PROPOSAL (not yet a migration): governed batch caller for the
-- signal gate — the missing caller.
-- Prepared 2026-11-04, companion to 20261104_signal_gate_uuid_era.
--
-- The trace found no caller anywhere (no TS code, no trigger, no
-- job) submitting bridged live_data_signals candidates to
-- evaluate_and_promote_signal. This function is that caller,
-- deliberately boring: it selects CURRENT observation candidates,
-- freshest first (the gate's temporal score decays with age), maps
-- each row's own fields onto the gate's inputs, and reports back
-- every decision. The gate decides; this function only carries.
--
-- Field mapping (all values are the row's own; nothing invented):
--   source_system      <- primary_stream_id, translated ONLY where
--                         the gate's own trust table names the source
--                         (cfpb_complaints->cfpb, sec_edgar->sec,
--                         pro_publica, grants_gov, court_listener,
--                         osha_inspections->osha, epa_echo->epa,
--                         fec_campaign_finance->fec); anything else
--                         passes through verbatim and takes the
--                         gate's default trust score.
--   jurisdiction       <- jurisdiction_id, verbatim (the gate
--                         scores the format; it is never rewritten).
--   verification       <- verification_state, verbatim.
--   generation_method  <- engine_id, verbatim.
--   record_origin      <- 'atlas_bridge' (their actual origin).
--   source_url         <- NULL (candidate rows carry no source
--                         URL; their evidence lives in the refs
--                         composed into evidence_payload).
--   evidence_payload   <- the row's supporting_statistics,
--                         evidence_refs, source_event_refs.
--   provenance         <- the row's engine/rule/candidate identity.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.run_signal_promotion_batch_v1(
    p_limit integer DEFAULT 25,
    p_primary_stream_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_row        record;
    v_result     jsonb;
    v_decisions  jsonb := '[]'::jsonb;
    v_tally      jsonb := '{}'::jsonb;
    v_decision   text;
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 500';
    END IF;

    FOR v_row IN
        SELECT *
          FROM public.live_data_signals
         WHERE is_current
           AND governance_status = 'observation_candidate'
           AND (p_primary_stream_id IS NULL OR primary_stream_id = p_primary_stream_id)
         ORDER BY detected_at DESC
         LIMIT p_limit
    LOOP
        v_result := public.evaluate_and_promote_signal(
            v_row.live_data_signal_id,
            v_row.signal_type,
            CASE v_row.primary_stream_id
                WHEN 'cfpb_complaints'      THEN 'cfpb'
                WHEN 'sec_edgar'            THEN 'sec'
                WHEN 'pro_publica'          THEN 'pro_publica'
                WHEN 'grants_gov'           THEN 'grants_gov'
                WHEN 'court_listener'       THEN 'court_listener'
                WHEN 'osha_inspections'     THEN 'osha'
                WHEN 'epa_echo'             THEN 'epa'
                WHEN 'fec_campaign_finance' THEN 'fec'
                ELSE v_row.primary_stream_id
            END,
            v_row.primary_stream_id,
            v_row.jurisdiction_id,
            v_row.primary_stream_id,
            v_row.confidence_score,
            v_row.severity,
            'active',
            v_row.detected_at,
            NULL,
            v_row.engine_id,
            v_row.detection_rule_id,
            v_row.detection_rule_version,
            'atlas_bridge',
            v_row.verification_state,
            jsonb_build_object(
                'supporting_statistics', v_row.supporting_statistics,
                'evidence_refs', v_row.evidence_refs,
                'source_event_refs', v_row.source_event_refs
            ),
            jsonb_build_object(
                'engine_id', v_row.engine_id,
                'engine_version', v_row.engine_version,
                'atlas_candidate_id', v_row.atlas_candidate_id,
                'atlas_candidate_hash', v_row.atlas_candidate_hash,
                'signal_hash', v_row.signal_hash,
                'input_hash', v_row.input_hash
            ),
            jsonb_build_object(
                'title', v_row.title,
                'description', v_row.description,
                'atlas_semantic_key', v_row.atlas_semantic_key
            )
        );

        v_decision := COALESCE(
            v_result #>> '{gate,decision}',
            v_result #>> '{promotion,status}',
            'unknown'
        );
        v_tally := v_tally || jsonb_build_object(
            v_decision,
            COALESCE((v_tally ->> v_decision)::integer, 0) + 1
        );
        v_decisions := v_decisions || jsonb_build_array(jsonb_build_object(
            'live_data_signal_id', v_row.live_data_signal_id,
            'primary_stream_id', v_row.primary_stream_id,
            'decision', v_decision,
            'composite_score', v_result #>> '{gate,composite_score}',
            'gate_log_id', v_result #>> '{gate,gate_log_id}',
            'promotion_status', v_result #>> '{promotion,status}',
            'detected_signal_id', v_result #>> '{promotion,detected_signal_id}'
        ));
    END LOOP;

    RETURN jsonb_build_object(
        'evaluated', jsonb_array_length(v_decisions),
        'tally', v_tally,
        'decisions', v_decisions
    );
END;
$function$;
