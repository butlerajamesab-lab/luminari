CREATE OR REPLACE FUNCTION public.rosetta_v2511_finalize_extraction(p_extraction_run_id integer, p_source_text text, p_source_metadata jsonb, p_base_receipt jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_run public.extraction_run%rowtype;
  v_document record;
  v_root_block_id text;
  v_operation record;
  v_operation_count integer := 0;
  v_definition_change_count integer := 0;
  v_definition_mismatch_count integer := 0;
  v_operation_mismatch_count integer := 0;
  v_block_id text;
  v_override_id text;
  v_section_number text;
  v_output jsonb;
  v_output_hash text;
  v_row_counts jsonb;
  v_validation jsonb;
  v_document_family text := lower(coalesce(p_source_metadata ->> 'docket_document_family', ''));
begin
  select * into v_run
  from public.extraction_run
  where id = p_extraction_run_id
  for update;
  if not found then raise exception 'rosetta_v22_extraction_run_not_found'; end if;
  if v_run.engine_version <> 'rosetta-v3-deterministic-sql-2.5.11'
     or v_run.rule_set_version <> 'rosetta-five-layer-structural-correctness-2.5.11' then
    raise exception 'rosetta_v22_engine_identity_mismatch';
  end if;

  select sd.corpus_id, sd.document_identifier
    into v_document
  from public.source_document sd
  where sd.id = v_run.source_document_id;

  if v_document_family = 'amendment' then
    perform public.rosetta_v24_prune_amendment_projection(p_extraction_run_id);
  end if;

  update public.term_definition definition
     set definition_text = public.rosetta_v25_exact_definition_text(
       p_source_text,
       definition.definition_text
     )
   where definition.extraction_run_id = p_extraction_run_id
     and definition.definition_text is distinct from
       public.rosetta_v25_exact_definition_text(
         p_source_text,
         definition.definition_text
       );
  get diagnostics v_definition_change_count = row_count;

  select count(*)::integer
    into v_definition_mismatch_count
  from public.term_definition definition
  where definition.extraction_run_id = p_extraction_run_id
    and not public.rosetta_v25_projected_contains(p_source_text, definition.definition_text);
  if v_definition_mismatch_count > 0 then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v22_definition_exact_text_validation_failed',
      detail = v_definition_mismatch_count::text;
  end if;

  if v_document_family = 'amendment' then
    select id into v_root_block_id
    from public.hr1_raw_blocks
    where extraction_run_id = p_extraction_run_id
      and block_type = 'document'
    order by id
    limit 1;
    if v_root_block_id is null then
      raise exception 'rosetta_v22_amendment_root_block_missing';
    end if;

    for v_operation in
      select *
      from public.rosetta_v2511_amendment_operations(p_source_text)
      order by operation_ordinal
    loop
      v_operation_count := v_operation_count + 1;
      v_section_number := 'Amendment Operation ' || v_operation.operation_ordinal;
      v_block_id := 'blk-v2511-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
        lpad(v_operation.operation_ordinal::text, 4, '0');
      v_override_id := 'ov-v2511-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
        lpad(v_operation.operation_ordinal::text, 4, '0');

      insert into public.hr1_raw_blocks (
        id, extraction_run_id, source_document_id, block_type, section_number,
        section_heading_hash, block_content_hash, parent_block_id, hierarchy_path,
        char_offset_start, char_offset_end
      ) values (
        v_block_id,
        p_extraction_run_id,
        v_run.source_document_id,
        'amendment_operation',
        v_section_number,
        encode(digest(convert_to(v_section_number, 'UTF8'), 'sha256'), 'hex'),
        encode(digest(convert_to(v_operation.operation_text, 'UTF8'), 'sha256'), 'hex'),
        v_root_block_id,
        v_document.document_identifier || '/' || v_section_number,
        v_operation.char_offset_start,
        v_operation.char_offset_end
      ) on conflict (id) do nothing;

      insert into public.entity_override (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, override_type, overridden_authority, override_scope,
        override_condition, granting_actor, actor_canon_id, effective_date,
        sunset_date, temporal_status, confidence, signal_status
      ) values (
        v_override_id,
        v_document.corpus_id,
        v_run.source_document_id,
        p_extraction_run_id,
        3,
        v_block_id,
        'source_stated_amendment_operation',
        coalesce(v_operation.target_locator, v_section_number),
        v_operation.operation_text,
        v_operation.operation_kind,
        null,
        null,
        null,
        null,
        public.rosetta_v2511_amendment_disposition(p_source_text, p_source_metadata),
        1.00,
        'confirmed'
      ) on conflict (id) do nothing;

      insert into public.layer_coverage (
        id, extraction_run_id, source_block_id, layer_name,
        coverage_status, reason, validated_at
      )
      select
        'lc-v2511-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
          lpad(v_operation.operation_ordinal::text, 4, '0') || '-' || layer_name,
        p_extraction_run_id,
        v_block_id,
        layer_name,
        case when layer_name = 'OVERRIDES'
          then 'populated'
          else 'not_applicable'
        end,
        case when layer_name = 'OVERRIDES'
          then 'Exact source-stated amendment operation captured without applying or interpreting legal effect.'
          else 'No deterministic ' || layer_name || ' object is created from a source-stated amendment operation.'
        end,
        clock_timestamp()
      from unnest(array[
        'HELP',
        'WORKFLOW',
        'ACCOUNTABILITY',
        'OVERRIDES',
        'DEFINITIONS'
      ]) layer_name
      on conflict (extraction_run_id, source_block_id, layer_name) do nothing;
    end loop;

    if v_operation_count = 0
       and public.rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v2511_amendment_structure_not_recognized';
    end if;

    select count(*)::integer
      into v_operation_mismatch_count
    from public.entity_override operation
    where operation.extraction_run_id = p_extraction_run_id
      and operation.override_type = 'source_stated_amendment_operation'
      and (
        strpos(
          lower(public.rosetta_v2_normalize_text(p_source_text)),
          lower(public.rosetta_v2_normalize_text(operation.override_scope))
        ) = 0
        or operation.override_scope !~* '^(On page |Strike everything after the enacting clause)'
        or operation.override_condition not in (
          'strike_and_insert',
          'strike',
          'insert',
          'delete',
          'renumber',
          'source_stated_operation'
        )
      );
    if v_operation_mismatch_count > 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v22_amendment_operation_validation_failed',
        detail = v_operation_mismatch_count::text;
    end if;
  end if;

  v_output := public.rosetta_v2511_canonical_output(p_extraction_run_id);
  if v_output is null then
    raise exception 'rosetta_v2511_canonical_output_unavailable';
  end if;
  v_output_hash := encode(
    digest(convert_to(v_output::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_row_counts := v_output -> 'row_counts';
  v_validation := jsonb_build_object(
    'status', 'pass',
    'contract', 'rosetta-structural-correctness-v2511',
    'definition_exact_text_change_count', v_definition_change_count,
    'definition_exact_text_mismatch_count', v_definition_mismatch_count,
    'amendment_operation_count', v_operation_count,
    'amendment_operation_mismatch_count', v_operation_mismatch_count,
    'document_family', nullif(v_document_family, ''),
    'amendment_format', case when v_document_family = 'amendment' then public.rosetta_v2511_amendment_format(p_source_text) else null end,
    'amendment_disposition', case when v_document_family = 'amendment'
      then public.rosetta_v2511_amendment_disposition(p_source_text, p_source_metadata)
      else null end
  );

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v2511-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-exact-source-structure',
    p_extraction_run_id,
    'exact_source_structure_v2511',
    'pass',
    0,
    v_validation
  ) on conflict (extraction_run_id, test_name) do update
  set test_result = excluded.test_result,
      failure_count = excluded.failure_count,
      details = excluded.details,
      executed_at = now();

  update public.extraction_manifest
     set row_counts = v_row_counts,
         validation_results = coalesce(validation_results, '{}'::jsonb)
           || jsonb_build_object('exact_source_structure_v2511', v_validation),
         output_hash = v_output_hash,
         status = 'clean',
         admissibility_state = 'admissible'
   where extraction_run_id = p_extraction_run_id;

  update public.extraction_run
     set output_content_hash = v_output_hash,
         run_status = 'completed',
         admissibility_state = 'admissible',
         failure_code = null,
         completed_at = coalesce(completed_at, clock_timestamp())
   where id = p_extraction_run_id;

  return p_base_receipt || jsonb_build_object(
    'engine_version', 'rosetta-v3-deterministic-sql-2.5.11',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.5.11',
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'exact_source_structure_v2511', v_validation,
    'replayed', coalesce((p_base_receipt ->> 'replayed')::boolean, false)
  );
end;
$function$
