CREATE OR REPLACE FUNCTION public.create_atlas_signal_chain(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id bigint;
  v_atlas_signal_id bigint;
  v_meta jsonb;
  v_signal_type text;
  v_signal_description text;
  v_title text;
  v_description text;
  v_location text;
  v_geography_key text;
  v_domain text;
  v_detected_at timestamptz;
  v_severity_score numeric;
  v_confidence_score numeric;
  v_severity_enum public.signal_severity_enum;
  v_case_number text;
  v_snapshot_hash text;
  v_case_id uuid;
  v_snapshot_id uuid;
  v_pipeline_run_id uuid;
  v_claim_id uuid;
  v_finding_id uuid;
  v_detected_signal_id uuid;
  v_existing_case_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload must be a JSON object';
  END IF;

  v_queue_id := COALESCE(
    NULLIF(p_payload->>'queue_id', '')::bigint,
    NULLIF(p_payload->'queue'->>'queue_id', '')::bigint
  );

  v_atlas_signal_id := COALESCE(
    NULLIF(p_payload->>'atlas_signal_id', '')::bigint,
    NULLIF(p_payload->'queue'->>'atlas_signal_id', '')::bigint
  );

  IF v_queue_id IS NULL THEN
    RAISE EXCEPTION 'queue_id is required';
  END IF;

  v_meta := COALESCE(
    p_payload->'payload_json'->'metadata_json',
    p_payload->'metadata_json',
    '{}'::jsonb
  );

  v_signal_type := COALESCE(
    NULLIF(p_payload->'payload_json'->>'signal_type', ''),
    NULLIF(p_payload->>'signal_type', ''),
    'atlas_signal'
  );

  v_geography_key := COALESCE(
    NULLIF(p_payload->'payload_json'->>'geography_key', ''),
    NULLIF(p_payload->>'geography_key', ''),
    NULLIF(v_meta->>'geography_key', ''),
    'unknown'
  );

  v_location := COALESCE(
    NULLIF(p_payload->'payload_json'->>'location', ''),
    NULLIF(p_payload->>'location', ''),
    NULLIF(v_meta->>'city', ''),
    NULLIF(v_meta->>'location', ''),
    v_geography_key,
    'Unknown'
  );

  v_domain := COALESCE(
    NULLIF(p_payload->'payload_json'->>'source_domain', ''),
    NULLIF(p_payload->>'source_domain', ''),
    NULLIF(v_meta->>'source_domain', ''),
    NULLIF(v_meta->>'domain', ''),
    'atlas'
  );

  v_severity_score := COALESCE(
    NULLIF(p_payload->'payload_json'->>'severity_score', '')::numeric,
    NULLIF(p_payload->>'severity_score', '')::numeric,
    0.50
  );

  v_confidence_score := COALESCE(
    NULLIF(p_payload->'payload_json'->>'confidence_score', '')::numeric,
    NULLIF(p_payload->>'confidence_score', '')::numeric,
    0.70
  );

  v_detected_at := COALESCE(
    NULLIF(p_payload->'payload_json'->>'detected_at', '')::timestamptz,
    NULLIF(p_payload->>'detected_at', '')::timestamptz,
    now()
  );

  v_severity_enum := public.map_atlas_severity_to_signal_enum(v_severity_score);
  v_title := COALESCE(NULLIF(v_meta->>'title', ''), v_signal_type);
  v_description := COALESCE(NULLIF(v_meta->>'description', ''), 'Atlas-generated signal');
  v_signal_description := COALESCE(NULLIF(v_meta->>'description', ''), 'Atlas-generated signal: ' || v_signal_type || ' in ' || v_location);
  v_case_number := 'ATLAS-' || v_queue_id::text;

  v_snapshot_hash := md5(
    'atlas:' ||
    COALESCE(v_queue_id::text, 'no-queue-id') || ':' ||
    COALESCE(v_atlas_signal_id::text, 'no-signal-id') || ':' ||
    COALESCE(v_signal_type, 'unknown-signal') || ':' ||
    COALESCE(v_geography_key, 'unknown-geography')
  );

  SELECT id INTO v_existing_case_id
  FROM public.cases
  WHERE case_number = v_case_number
  LIMIT 1;

  IF v_existing_case_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'duplicate_case_number', 'case_number', v_case_number, 'case_id', v_existing_case_id, 'message', 'Case already exists for this Atlas queue row. Worker must verify chain or mark Atlas row failed/completed explicitly.');
  END IF;

  INSERT INTO public.cases (case_number, title, description, case_type, jurisdiction, domain, status, priority_level, owner_ref, created_at, updated_at)
  VALUES (v_case_number, v_title, v_description, v_signal_type, v_geography_key, v_domain, 'active', v_severity_enum::text, 'system', v_detected_at, now())
  RETURNING id INTO v_case_id;

  INSERT INTO public.snapshots (case_id, snapshot_hash, status, created_at)
  VALUES (v_case_id, v_snapshot_hash, 'open', now())
  RETURNING id INTO v_snapshot_id;

  INSERT INTO public.pipeline_runs (case_id, snapshot_id, status, started_at)
  VALUES (v_case_id, v_snapshot_id, 'running'::public.run_status_enum, now())
  RETURNING id INTO v_pipeline_run_id;

  INSERT INTO public.claims (case_id, snapshot_id, pipeline_run_id, claim_text, claim_type)
  VALUES (v_case_id, v_snapshot_id, v_pipeline_run_id, 'Atlas automated detection: ' || v_signal_type || ' in ' || v_location, 'systemic')
  RETURNING id INTO v_claim_id;

  INSERT INTO public.findings (case_id, claim_id, snapshot_id, pipeline_run_id, finding_text, confidence_score)
  VALUES (v_case_id, v_claim_id, v_snapshot_id, v_pipeline_run_id, COALESCE(NULLIF(v_meta->>'finding_text', ''), 'Atlas detected signal: ' || v_signal_type || ' in ' || v_location), v_confidence_score)
  RETURNING id INTO v_finding_id;

  INSERT INTO public.detected_signals (case_id, finding_id, snapshot_id, pipeline_run_id, signal_type, signal_description, severity, confidence_score)
  VALUES (v_case_id, v_finding_id, v_snapshot_id, v_pipeline_run_id, v_signal_type, v_signal_description, v_severity_enum, v_confidence_score)
  RETURNING id INTO v_detected_signal_id;

  UPDATE public.pipeline_runs
  SET status = 'completed'::public.run_status_enum,
      completed_at = now()
  WHERE id = v_pipeline_run_id;

  UPDATE public.snapshots
  SET status = 'sealed',
      sealed_at = now()
  WHERE id = v_snapshot_id;

  RETURN jsonb_build_object('success', true, 'case_number', v_case_number, 'case_id', v_case_id, 'snapshot_id', v_snapshot_id, 'pipeline_run_id', v_pipeline_run_id, 'claim_id', v_claim_id, 'finding_id', v_finding_id, 'detected_signal_id', v_detected_signal_id, 'severity', v_severity_enum, 'atlas_signal_id', v_atlas_signal_id, 'queue_id', v_queue_id);
END;
$$;

COMMENT ON FUNCTION public.create_atlas_signal_chain(jsonb)
IS 'Creates one Lighthouse strict relational chain from one Atlas queue payload. Does not update Atlas queue state. Intended for external worker/Edge Function use. Uses md5 snapshot hash for compatibility.';
