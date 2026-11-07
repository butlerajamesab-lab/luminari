-- Seam-suite support: production-verbatim definitions (see test header).

CREATE OR REPLACE FUNCTION public.signal_architecture_hash_v1(p_payload jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
  select encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
$function$;

CREATE OR REPLACE FUNCTION public.live_data_signal_semantic_key_v2(p_detection_rule_id text, p_signal_type text, p_primary_stream_id text, p_jurisdiction_id text, p_title text, p_entity_ids text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'extensions', 'pg_temp'
AS $function$
  select encode(
    extensions.digest(
      convert_to(
        concat_ws(
          chr(31),
          coalesce(p_detection_rule_id, ''),
          coalesce(p_signal_type, ''),
          case
            when p_detection_rule_id = 'atlas.domain3.cross_category_entity' then ''
            else coalesce(p_primary_stream_id, '')
          end,
          coalesce(p_jurisdiction_id, ''),
          coalesce(p_title, ''),
          case
            when p_detection_rule_id = 'atlas.propublica_unresolved_filing_metadata_rate'
              then coalesce((select string_agg(value, chr(30) order by value) from unnest(coalesce(p_entity_ids, array[]::text[])) value), '')
            else ''
          end
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$function$;

CREATE OR REPLACE FUNCTION public.guard_signal_architecture_immutable_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception '% is append-only; delete is not permitted', tg_table_name; end if;
  if (to_jsonb(new) - 'is_current') is distinct from (to_jsonb(old) - 'is_current') then raise exception '% records are immutable; create a superseding record instead', tg_table_name; end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.project_atlas_integrity_candidate_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
begin
  if new.is_current
     and new.governance_status = 'observation_candidate'
     and new.detection_rule_id like 'atlas.domain3.integrity.%' then
    perform public.project_atlas_integrity_candidate_v1(new.live_data_signal_id);
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.project_atlas_integrity_candidate_v1(p_signal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private', 'public'
AS $function$
declare
  v_signal public.live_data_signals%rowtype;
  v_candidate_type text;
  v_candidate_id uuid;
  v_evidence_id uuid;
  v_evidence_ids uuid[] := array[]::uuid[];
  v_ref jsonb;
  v_source_hash text;
  v_source_id text;
begin
  select *
  into v_signal
  from public.live_data_signals
  where live_data_signal_id = p_signal_id;

  if not found then
    raise exception 'Atlas Domain 3 record does not exist: %', p_signal_id;
  end if;

  if not v_signal.is_current
     or v_signal.governance_status <> 'observation_candidate'
     or v_signal.detection_rule_id not like 'atlas.domain3.integrity.%' then
    return jsonb_build_object(
      'projected', false,
      'signal_id', p_signal_id,
      'reason', 'not_a_current_atlas_integrity_observation_candidate'
    );
  end if;

  v_candidate_type := case v_signal.signal_type
    when 'phoenix_continuity_candidate' then 'phoenix_successor_pattern'
    when 'exact_identifier_reuse_candidate' then 'exact_identifier_reuse_pattern'
    when 'financial_conduit_candidate' then 'financial_conduit_pattern'
    when 'legislative_financial_convergence_candidate' then 'legislative_integrity_anomaly'
    when 'source_contradiction_candidate' then 'contradiction_pattern'
    when 'numeric_range_anomaly_candidate' then 'numeric_range_anomaly'
    else null
  end;

  if v_candidate_type is null then
    raise exception 'Unsupported Atlas integrity signal type: %', v_signal.signal_type;
  end if;

  if jsonb_typeof(v_signal.evidence_refs) is distinct from 'array'
     or jsonb_array_length(v_signal.evidence_refs) = 0 then
    raise exception 'Atlas integrity candidate requires at least one evidence reference';
  end if;

  v_candidate_id := public.register_integrity_pattern_candidate_v1(
    jsonb_strip_nulls(jsonb_build_object(
      'signal_id', v_signal.live_data_signal_id,
      'candidate_type', v_candidate_type,
      'subject_scope', jsonb_strip_nulls(jsonb_build_object(
        'atlas_candidate_id', v_signal.atlas_candidate_id,
        'atlas_candidate_hash', v_signal.atlas_candidate_hash,
        'atlas_semantic_key', v_signal.atlas_semantic_key,
        'atlas_signal_type', v_signal.signal_type,
        'atlas_description', v_signal.description,
        'primary_stream_id', v_signal.primary_stream_id,
        'source_event_refs', v_signal.source_event_refs,
        'entity_ids', to_jsonb(v_signal.entity_ids),
        'entity_resolution_status', v_signal.entity_resolution_status,
        'severity', v_signal.severity,
        'confidence_score', v_signal.confidence_score,
        'verification_state', v_signal.verification_state,
        'governance_status', v_signal.governance_status,
        'supporting_statistics', v_signal.supporting_statistics,
        'source_freshness_at', v_signal.source_freshness_at
      )),
      'jurisdiction_id', nullif(v_signal.jurisdiction_id, 'unknown'),
      'summary', v_signal.title,
      'rule_id', v_signal.detection_rule_id,
      'rule_version', v_signal.detection_rule_version,
      'observed_at', v_signal.detected_at
    ))
  );

  for v_ref in
    select value
    from jsonb_array_elements(v_signal.evidence_refs)
  loop
    v_source_hash := lower(coalesce(v_ref->>'event_identity_hash', ''));
    if v_source_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'Atlas evidence reference is missing its event SHA-256';
    end if;

    v_source_id := coalesce(
      nullif(v_ref->>'source_id', ''),
      nullif(v_ref->>'stream_id', ''),
      'unknown_source'
    );

    v_evidence_id := public.attach_integrity_candidate_evidence_v1(
      jsonb_strip_nulls(jsonb_build_object(
        'candidate_id', v_candidate_id,
        'source_class', private.integrity_source_class_from_atlas_v1(v_ref->>'source_class'),
        'source_relation', 'atlas.signal_events/' || v_source_id,
        'source_record_key', coalesce(
          nullif(v_ref->>'source_record_key', ''),
          coalesce(v_ref->>'stream_id', 'unknown_stream') || ':' || coalesce(v_ref->>'offset', 'unknown_offset')
        ),
        'source_uri', nullif(v_ref->>'source_uri', ''),
        'quote_text', nullif(v_ref->>'quote_text', ''),
        'pinpoint', coalesce(
          nullif(v_ref->>'pinpoint', ''),
          coalesce(v_ref->>'stream_id', 'unknown_stream') || ':offset:' || coalesce(v_ref->>'offset', 'unknown')
        ),
        'source_content_hash', v_source_hash,
        'supports_or_contradicts', 'supports',
        'observed_at', nullif(v_ref->>'observed_at', '')
      ))
    );
    v_evidence_ids := array_append(v_evidence_ids, v_evidence_id);
  end loop;

  return jsonb_build_object(
    'projected', true,
    'signal_id', p_signal_id,
    'candidate_id', v_candidate_id,
    'candidate_type', v_candidate_type,
    'evidence_link_ids', to_jsonb(v_evidence_ids),
    'evidence_count', cardinality(v_evidence_ids)
  );
end;
$function$;

CREATE TRIGGER live_data_signals_immutable_v1 BEFORE DELETE OR UPDATE ON public.live_data_signals FOR EACH ROW EXECUTE FUNCTION guard_signal_architecture_immutable_v1();

CREATE TRIGGER project_atlas_integrity_candidate_v1 AFTER INSERT OR UPDATE OF is_current, governance_status ON public.live_data_signals FOR EACH ROW EXECUTE FUNCTION private.project_atlas_integrity_candidate_trigger_v1();

CREATE OR REPLACE FUNCTION public.register_live_data_signal_receipt_v1(p_record jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_live_data_signal_id uuid;
  v_signal_hash text;
begin
  v_live_data_signal_id := public.register_live_data_signal_v1(p_record);

  if v_live_data_signal_id is null then
    raise exception 'live-data signal registration returned no identity';
  end if;

  select signal_hash
    into v_signal_hash
    from public.live_data_signals
   where live_data_signal_id = v_live_data_signal_id;

  if v_signal_hash is null then
    raise exception 'registered live-data signal could not be read back: %',
      v_live_data_signal_id;
  end if;

  return jsonb_build_object(
    'live_data_signal_id', v_live_data_signal_id,
    'signal_hash', v_signal_hash,
    'governance_status', (
      select governance_status
      from public.live_data_signals
      where live_data_signal_id = v_live_data_signal_id
    ),
    'registered_at', clock_timestamp()
  );
end
$function$;
