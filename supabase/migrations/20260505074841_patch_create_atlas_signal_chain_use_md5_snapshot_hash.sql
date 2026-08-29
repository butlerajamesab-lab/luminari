-- Restored from the exact production migration receipt.
-- Production statements MD5: 57674c4b6da3a44717990841e7b13783

create or replace function public.create_atlas_signal_chain(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload must be a JSON object';
  end if;

  v_queue_id := coalesce(
    nullif(p_payload->>'queue_id', '')::bigint,
    nullif(p_payload->'queue'->>'queue_id', '')::bigint
  );

  v_atlas_signal_id := coalesce(
    nullif(p_payload->>'atlas_signal_id', '')::bigint,
    nullif(p_payload->'queue'->>'atlas_signal_id', '')::bigint
  );

  if v_queue_id is null then
    raise exception 'queue_id is required';
  end if;

  v_meta := coalesce(
    p_payload->'payload_json'->'metadata_json',
    p_payload->'metadata_json',
    '{}'::jsonb
  );

  v_signal_type := coalesce(
    nullif(p_payload->'payload_json'->>'signal_type', ''),
    nullif(p_payload->>'signal_type', ''),
    'atlas_signal'
  );

  v_geography_key := coalesce(
    nullif(p_payload->'payload_json'->>'geography_key', ''),
    nullif(p_payload->>'geography_key', ''),
    nullif(v_meta->>'geography_key', ''),
    'unknown'
  );

  v_location := coalesce(
    nullif(p_payload->'payload_json'->>'location', ''),
    nullif(p_payload->>'location', ''),
    nullif(v_meta->>'city', ''),
    nullif(v_meta->>'location', ''),
    v_geography_key,
    'Unknown'
  );

  v_domain := coalesce(
    nullif(p_payload->'payload_json'->>'source_domain', ''),
    nullif(p_payload->>'source_domain', ''),
    nullif(v_meta->>'source_domain', ''),
    nullif(v_meta->>'domain', ''),
    'atlas'
  );

  v_severity_score := coalesce(
    nullif(p_payload->'payload_json'->>'severity_score', '')::numeric,
    nullif(p_payload->>'severity_score', '')::numeric,
    0.50
  );

  v_confidence_score := coalesce(
    nullif(p_payload->'payload_json'->>'confidence_score', '')::numeric,
    nullif(p_payload->>'confidence_score', '')::numeric,
    0.70
  );

  v_detected_at := coalesce(
    nullif(p_payload->'payload_json'->>'detected_at', '')::timestamptz,
    nullif(p_payload->>'detected_at', '')::timestamptz,
    now()
  );

  v_severity_enum := public.map_atlas_severity_to_signal_enum(v_severity_score);
  v_title := coalesce(nullif(v_meta->>'title', ''), v_signal_type);
  v_description := coalesce(nullif(v_meta->>'description', ''), 'Atlas-generated signal');
  v_signal_description := coalesce(
    nullif(v_meta->>'description', ''),
    'Atlas-generated signal: ' || v_signal_type || ' in ' || v_location
  );
  v_case_number := 'ATLAS-' || v_queue_id::text;

  v_snapshot_hash := md5(
    'atlas:' ||
    coalesce(v_queue_id::text, 'no-queue-id') || ':' ||
    coalesce(v_atlas_signal_id::text, 'no-signal-id') || ':' ||
    coalesce(v_signal_type, 'unknown-signal') || ':' ||
    coalesce(v_geography_key, 'unknown-geography')
  );

  select id into v_existing_case_id
  from public.cases
  where case_number = v_case_number
  limit 1;

  if v_existing_case_id is not null then
    return jsonb_build_object(
      'success', false,
      'status', 'duplicate_case_number',
      'case_number', v_case_number,
      'case_id', v_existing_case_id,
      'message', 'Case already exists for this Atlas queue row. Worker must verify chain or mark Atlas row failed/completed explicitly.'
    );
  end if;

  insert into public.cases (
    case_number,
    title,
    description,
    case_type,
    jurisdiction,
    domain,
    status,
    priority_level,
    owner_ref,
    created_at,
    updated_at
  )
  values (
    v_case_number,
    v_title,
    v_description,
    v_signal_type,
    v_geography_key,
    v_domain,
    'active',
    v_severity_enum::text,
    'system',
    v_detected_at,
    now()
  )
  returning id into v_case_id;

  insert into public.snapshots (case_id, snapshot_hash, status, created_at)
  values (v_case_id, v_snapshot_hash, 'open', now())
  returning id into v_snapshot_id;

  insert into public.pipeline_runs (case_id, snapshot_id, status, started_at)
  values (
    v_case_id,
    v_snapshot_id,
    'running'::public.run_status_enum,
    now()
  )
  returning id into v_pipeline_run_id;

  insert into public.claims (
    case_id,
    snapshot_id,
    pipeline_run_id,
    claim_text,
    claim_type
  )
  values (
    v_case_id,
    v_snapshot_id,
    v_pipeline_run_id,
    'Atlas automated detection: ' || v_signal_type || ' in ' || v_location,
    'systemic'
  )
  returning id into v_claim_id;

  insert into public.findings (
    case_id,
    claim_id,
    snapshot_id,
    pipeline_run_id,
    finding_text,
    confidence_score
  )
  values (
    v_case_id,
    v_claim_id,
    v_snapshot_id,
    v_pipeline_run_id,
    coalesce(
      nullif(v_meta->>'finding_text', ''),
      'Atlas detected signal: ' || v_signal_type || ' in ' || v_location
    ),
    v_confidence_score
  )
  returning id into v_finding_id;

  insert into public.detected_signals (
    case_id,
    finding_id,
    snapshot_id,
    pipeline_run_id,
    signal_type,
    signal_description,
    severity,
    confidence_score
  )
  values (
    v_case_id,
    v_finding_id,
    v_snapshot_id,
    v_pipeline_run_id,
    v_signal_type,
    v_signal_description,
    v_severity_enum,
    v_confidence_score
  )
  returning id into v_detected_signal_id;

  update public.pipeline_runs
  set status = 'completed'::public.run_status_enum,
      completed_at = now()
  where id = v_pipeline_run_id;

  update public.snapshots
  set status = 'sealed',
      sealed_at = now()
  where id = v_snapshot_id;

  return jsonb_build_object(
    'success', true,
    'case_number', v_case_number,
    'case_id', v_case_id,
    'snapshot_id', v_snapshot_id,
    'pipeline_run_id', v_pipeline_run_id,
    'claim_id', v_claim_id,
    'finding_id', v_finding_id,
    'detected_signal_id', v_detected_signal_id,
    'severity', v_severity_enum,
    'atlas_signal_id', v_atlas_signal_id,
    'queue_id', v_queue_id
  );
end;
$$;

comment on function public.create_atlas_signal_chain(jsonb) is
  'Creates one Lighthouse strict relational chain from one Atlas queue payload. Does not update Atlas queue state. Intended for external worker/Edge Function use. Uses md5 snapshot hash for compatibility.';
