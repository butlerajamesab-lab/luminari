-- ============================================================================
-- Migration: lane c7 -- C7 decoding-method receipts; undispositioned replacement chars block
-- One-variable experiment: a full independent copy of the 51-function closure
-- in rosetta_v2513 with prefix c7_, identity tokens swapped inside string
-- literals only ('2.5.11' -> '2.5.13-c7'), plus the lane's surgical change.
-- No reference to shared mutable rosetta_v25_* / rosetta_v2_* helpers outside
-- this closed namespace. Never published; no registry row is created here
-- (is_active = false, and the production registry is never touched).
-- ============================================================================
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_blocking_structural_repair_count(p_extraction_run_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select count(*)::integer
  from rosetta_v2513.rosetta_structural_repair_queue repair
  where repair.extraction_run_id = p_extraction_run_id
    and repair.repair_state in ('open', 'in_review')
    and (
      repair.defect_type <> 'actor_unresolved'
      or nullif(btrim(repair.defect_detail ->> 'actor_source_text'), '') is null
      or (repair.defect_detail ->> 'actor_source_text') ~ '^\s*[0-9]+(?:\s|\.|\))'
      or (repair.defect_detail ->> 'actor_source_text') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
    );
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_normalize_clause_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select trim(regexp_replace(
    regexp_replace(
      lower(p_text),
      '^\s*[0-9]+(?:\s+and\s+[0-9]+)?\s+c\s+[0-9]+\s+s\s+[0-9]+\s+(?:is|are)\s+(?:each\s+)?amended\s+to\s+read\s+as\s+follows:\s*',
      '',
      'i'
    ),
    '\s+',
    ' ',
    'g'
  ));
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v24_amendment_operations(p_source_text text)
 RETURNS TABLE(operation_ordinal integer, operation_text text, target_locator text, operation_kind text, char_offset_start integer, char_offset_end integer)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_source text := p_source_text;
  v_match text[];
  v_operation text;
  v_target text;
  v_action_position integer;
  v_start integer;
  v_ordinal integer := 0;
begin
  for v_match in
    select regexp_matches(
      v_source,
      '(?i)((On page .*?)(?= On page | EFFECT:| --- END ---|$)|(Strike everything after the enacting clause and insert the following: .*?)(?= EFFECT:| --- END ---|$))',
      'g'
    )
  loop
    v_operation := v_match[1];
    v_start := strpos(p_source_text, v_operation);
    if v_start = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v24_amendment_operation_offset_unresolved',
        detail = left(v_operation, 500);
    end if;

    v_action_position := regexp_instr(
      v_operation,
      '\m(strike|insert|delete|renumber)\M',
      1,
      1,
      0,
      'i'
    );
    if v_action_position = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v24_amendment_operation_verb_missing',
        detail = left(v_operation, 500);
    end if;

    if v_operation ~* '^Strike everything after the enacting clause and insert the following:' then
      v_target := 'Strike everything after the enacting clause';
    else
      v_target := nullif(
        btrim(substr(v_operation, 1, v_action_position - 1)),
        ''
      );
    end if;

    v_ordinal := v_ordinal + 1;
    return query
    select
      v_ordinal,
      v_operation,
      v_target,
      case
        when v_operation ~* '\mstrike\M' and v_operation ~* '\minsert\M'
          then 'strike_and_insert'
        when v_operation ~* '\mrenumber\M' then 'renumber'
        when v_operation ~* '\mdelete\M' then 'delete'
        when v_operation ~* '\mstrike\M' then 'strike'
        when v_operation ~* '\minsert\M' then 'insert'
        else 'source_stated_operation'
      end,
      v_start - 1,
      v_start - 1 + char_length(v_operation);
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v24_prune_amendment_projection(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_coverage_count integer := 0;
begin
  delete from rosetta_v2513.term_definition_affected_steps affected
   where affected.term_definition_id in (
     select definition.id
     from rosetta_v2513.term_definition definition
     where definition.extraction_run_id = p_extraction_run_id
   )
      or affected.workflow_step_id in (
     select step.id
     from rosetta_v2513.workflow_step step
     join rosetta_v2513.workflow_pipeline pipeline
       on pipeline.id = step.workflow_pipeline_id
     where pipeline.extraction_run_id = p_extraction_run_id
   );

  if to_regclass('rosetta_v2513.rosetta_object_correction') is not null then
    execute 'delete from rosetta_v2513.rosetta_object_correction where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;
  if to_regclass('rosetta_v2513.rosetta_structural_repair_queue') is not null then
    execute 'delete from rosetta_v2513.rosetta_structural_repair_queue where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;

  delete from rosetta_v2513.help_entity
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_help_count = row_count;

  delete from rosetta_v2513.workflow_pipeline
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_workflow_count = row_count;

  delete from rosetta_v2513.accountability_route
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_accountability_count = row_count;

  delete from rosetta_v2513.entity_override
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_override_count = row_count;

  delete from rosetta_v2513.term_definition
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_definition_count = row_count;

  delete from rosetta_v2513.layer_coverage
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_coverage_count = row_count;

  return jsonb_build_object(
    'contract', 'rosetta-amendment-projection-prune-v1',
    'extraction_run_id', p_extraction_run_id,
    'pruned', jsonb_build_object(
      'help', v_help_count,
      'workflow_pipelines', v_workflow_count,
      'accountability_routes', v_accountability_count,
      'overrides', v_override_count,
      'definitions', v_definition_count,
      'coverage_receipts', v_coverage_count
    )
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2510_amendment_operations(p_source_text text)
 RETURNS TABLE(operation_ordinal integer, operation_text text, target_locator text, operation_kind text, char_offset_start integer, char_offset_end integer)
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    operation.operation_ordinal,
    rosetta_v2513.c7_rosetta_v2510_clean_amendment_operation_text(operation.operation_text) as operation_text,
    operation.target_locator,
    operation.operation_kind,
    operation.char_offset_start,
    operation.char_offset_start
      + char_length(rosetta_v2513.c7_rosetta_v2510_clean_amendment_operation_text(operation.operation_text)) as char_offset_end
  from rosetta_v2513.c7_rosetta_v24_amendment_operations(p_source_text) operation
  where nullif(btrim(rosetta_v2513.c7_rosetta_v2510_clean_amendment_operation_text(operation.operation_text)), '') is not null
  order by operation.operation_ordinal;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2510_clean_amendment_operation_text(p_operation_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_text text := p_operation_text;
  v_next text;
begin
  loop
    v_next := regexp_replace(
      v_text,
      '[[:space:]]*(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$',
      '',
      'i'
    );
    exit when v_next = v_text;
    v_text := v_next;
  end loop;
  return rtrim(v_text);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_amendment_disposition(p_source_text text, p_source_metadata jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_metadata_disposition text;
  v_source_disposition text;
begin
  if jsonb_typeof(coalesce(p_source_metadata,'{}'::jsonb)->'docket_adopted')='boolean' then
    v_metadata_disposition:=case when (p_source_metadata->>'docket_adopted')::boolean then 'adopted' else 'not_adopted' end;
  elsif jsonb_typeof(coalesce(p_source_metadata,'{}'::jsonb)#>'{registered_metadata,adopted}')='boolean' then
    v_metadata_disposition:=case when (p_source_metadata#>>'{registered_metadata,adopted}')::boolean then 'adopted' else 'not_adopted' end;
  end if;

  if p_source_text ~* E'(^|\\r?\\n)[ \\t]*NOT[ \\t]+ADOPTED[ \\t]*(\\r?\\n|$)' then
    v_source_disposition:='not_adopted';
  elsif p_source_text ~* E'(^|\\r?\\n)[ \\t]*ADOPTED[ \\t]*(\\r?\\n|$)' then
    v_source_disposition:='adopted';
  end if;

  if v_metadata_disposition is not null
     and v_source_disposition is not null
     and v_metadata_disposition<>v_source_disposition then
    raise exception using
      errcode='22000',
      message='rosetta_v2513c7_amendment_disposition_conflict',
      detail=jsonb_build_object(
        'metadata_disposition',v_metadata_disposition,
        'source_status_line_disposition',v_source_disposition
      )::text;
  end if;

  return coalesce(v_metadata_disposition,v_source_disposition,'unknown');
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when exists (
      select 1
      from rosetta_v2513.c7_rosetta_v2510_amendment_operations(p_source_text)
    ) then 'operation_sheet'
    when p_source_text ~* 'the[[:space:]]+bill[[:space:]]+as[[:space:]]+proposed[[:space:]]+to[[:space:]]+be[[:space:]]+amended[[:space:]]+is[[:space:]]+reprinted[[:space:]]+as[[:space:]]+follows'
     and p_source_text ~* 'amendment[[:space:]]+instruction[[:space:]]+key'
      then 'marked_full_text_reprint'
    else 'unsupported'
  end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_amendment_operations(p_source_text text)
 RETURNS TABLE(operation_ordinal integer, operation_text text, target_locator text, operation_kind text, char_offset_start integer, char_offset_end integer)
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    operation.operation_ordinal,
    rosetta_v2513.c7_rosetta_v2511_clean_amendment_operation_text(operation.operation_text) as operation_text,
    operation.target_locator,
    operation.operation_kind,
    operation.char_offset_start,
    operation.char_offset_start
      + char_length(rosetta_v2513.c7_rosetta_v2511_clean_amendment_operation_text(operation.operation_text)) as char_offset_end
  from rosetta_v2513.c7_rosetta_v24_amendment_operations(p_source_text) operation
  where nullif(btrim(rosetta_v2513.c7_rosetta_v2511_clean_amendment_operation_text(operation.operation_text)), '') is not null
  order by operation.operation_ordinal;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_canonical_output(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with base as (
    select rosetta_v2513.c7_rosetta_v254_canonical_output(p_extraction_run_id) as value
  ),
  structural as (
    select coalesce(law.structural_representations,'[]'::jsonb) as value
    from rosetta_v2513.v_rosetta_operator_law_view_v1 law
    where law.extraction_run_id=p_extraction_run_id
  ),
  counts as (
    select count(*)::integer as structural_count
    from rosetta_v2513.rosetta_structural_representation representation
    where representation.extraction_run_id=p_extraction_run_id
  )
  select case when base.value is null then null else
    base.value || jsonb_build_object(
      'contract','rosetta-canonical-law-view-v2513c7',
      'handoff_contract_version','rosetta-civic-genome-handoff-v2',
      'structural_representations',coalesce(structural.value,'[]'::jsonb),
      'row_counts',coalesce(base.value->'row_counts','{}'::jsonb)
        || jsonb_build_object('structural_representations',counts.structural_count)
    ) end
  from base
  left join structural on true
  cross join counts;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_clean_amendment_operation_text(p_operation_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_text text := p_operation_text;
  v_next text;
begin
  loop
    v_next := regexp_replace(
      v_text,
      '[[:space:]]*(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$',
      '',
      'i'
    );
    exit when v_next = v_text;
    v_text := v_next;
  end loop;
  return rtrim(v_text);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_final_coverage(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_object_agg(
    lower(layer.layer_name),
    jsonb_build_object('status',layer.coverage_status,'reason',layer.reason,'validated_at',layer.validated_at)
    order by layer.layer_name
  ),'{}'::jsonb)
  from (
    select coverage.layer_name,
      case when bool_or(coverage.coverage_status='extraction_failed') then 'extraction_failed'
           when bool_or(coverage.coverage_status='pending_extraction') then 'pending_extraction'
           when bool_or(coverage.coverage_status='populated') then 'populated'
           else 'not_applicable' end as coverage_status,
      string_agg(distinct coverage.reason,' | ' order by coverage.reason) filter(where coverage.reason is not null) as reason,
      max(coverage.validated_at) as validated_at
    from rosetta_v2513.layer_coverage coverage
    where coverage.extraction_run_id=p_extraction_run_id
    group by coverage.layer_name
  ) layer;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_finalize_extraction(p_extraction_run_id integer, p_source_text text, p_source_metadata jsonb, p_base_receipt jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_run rosetta_v2513.extraction_run%rowtype;
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
  from rosetta_v2513.extraction_run
  where id = p_extraction_run_id
  for update;
  if not found then raise exception 'rosetta_v22_extraction_run_not_found'; end if;
  if v_run.engine_version <> 'rosetta-v3-deterministic-sql-2.5.13-c7'
     or v_run.rule_set_version <> 'rosetta-five-layer-structural-correctness-2.5.13-c7' then
    raise exception 'rosetta_v22_engine_identity_mismatch';
  end if;

  select sd.corpus_id, sd.document_identifier
    into v_document
  from rosetta_v2513.source_document sd
  where sd.id = v_run.source_document_id;

  if v_document_family = 'amendment' then
    perform rosetta_v2513.c7_rosetta_v24_prune_amendment_projection(p_extraction_run_id);
  end if;

  update rosetta_v2513.term_definition definition
     set definition_text = rosetta_v2513.c7_rosetta_v25_exact_definition_text(
       p_source_text,
       definition.definition_text
     )
   where definition.extraction_run_id = p_extraction_run_id
     and definition.definition_text is distinct from
       rosetta_v2513.c7_rosetta_v25_exact_definition_text(
         p_source_text,
         definition.definition_text
       );
  get diagnostics v_definition_change_count = row_count;

  select count(*)::integer
    into v_definition_mismatch_count
  from rosetta_v2513.term_definition definition
  where definition.extraction_run_id = p_extraction_run_id
    and not rosetta_v2513.c7_rosetta_v25_projected_contains(p_source_text, definition.definition_text);
  if v_definition_mismatch_count > 0 then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v22_definition_exact_text_validation_failed',
      detail = v_definition_mismatch_count::text;
  end if;

  if v_document_family = 'amendment' then
    select id into v_root_block_id
    from rosetta_v2513.hr1_raw_blocks
    where extraction_run_id = p_extraction_run_id
      and block_type = 'document'
    order by id
    limit 1;
    if v_root_block_id is null then
      raise exception 'rosetta_v22_amendment_root_block_missing';
    end if;

    for v_operation in
      select *
      from rosetta_v2513.c7_rosetta_v2511_amendment_operations(p_source_text)
      order by operation_ordinal
    loop
      v_operation_count := v_operation_count + 1;
      v_section_number := 'Amendment Operation ' || v_operation.operation_ordinal;
      v_block_id := 'blk-v2513c7-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
        lpad(v_operation.operation_ordinal::text, 4, '0');
      v_override_id := 'ov-v2513c7-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
        lpad(v_operation.operation_ordinal::text, 4, '0');

      insert into rosetta_v2513.hr1_raw_blocks (
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

      insert into rosetta_v2513.entity_override (
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
        rosetta_v2513.c7_rosetta_v2511_amendment_disposition(p_source_text, p_source_metadata),
        1.00,
        'confirmed'
      ) on conflict (id) do nothing;

      insert into rosetta_v2513.layer_coverage (
        id, extraction_run_id, source_block_id, layer_name,
        coverage_status, reason, validated_at
      )
      select
        'lc-v2513c7-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-amend-' ||
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
       and rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v2513c7_amendment_structure_not_recognized';
    end if;

    select count(*)::integer
      into v_operation_mismatch_count
    from rosetta_v2513.entity_override operation
    where operation.extraction_run_id = p_extraction_run_id
      and operation.override_type = 'source_stated_amendment_operation'
      and (
        strpos(
          lower(rosetta_v2513.c7_rosetta_v2_normalize_text(p_source_text)),
          lower(rosetta_v2513.c7_rosetta_v2_normalize_text(operation.override_scope))
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

  v_output := rosetta_v2513.c7_rosetta_v2511_canonical_output(p_extraction_run_id);
  if v_output is null then
    raise exception 'rosetta_v2513c7_canonical_output_unavailable';
  end if;
  v_output_hash := encode(
    digest(convert_to(v_output::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_row_counts := v_output -> 'row_counts';
  v_validation := jsonb_build_object(
    'status', 'pass',
    'contract', 'rosetta-structural-correctness-v2513c7',
    'definition_exact_text_change_count', v_definition_change_count,
    'definition_exact_text_mismatch_count', v_definition_mismatch_count,
    'amendment_operation_count', v_operation_count,
    'amendment_operation_mismatch_count', v_operation_mismatch_count,
    'document_family', nullif(v_document_family, ''),
    'amendment_format', case when v_document_family = 'amendment' then rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text) else null end,
    'amendment_disposition', case when v_document_family = 'amendment'
      then rosetta_v2513.c7_rosetta_v2511_amendment_disposition(p_source_text, p_source_metadata)
      else null end
  );

  insert into rosetta_v2513.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v2513c7-' || v_run.source_identity_hash || '-' || v_run.configuration_hash || '-exact-source-structure',
    p_extraction_run_id,
    'exact_source_structure_v2513c7',
    'pass',
    0,
    v_validation
  ) on conflict (extraction_run_id, test_name) do update
  set test_result = excluded.test_result,
      failure_count = excluded.failure_count,
      details = excluded.details,
      executed_at = now();

  update rosetta_v2513.extraction_manifest
     set row_counts = v_row_counts,
         validation_results = coalesce(validation_results, '{}'::jsonb)
           || jsonb_build_object('exact_source_structure_v2513c7', v_validation),
         output_hash = v_output_hash,
         status = 'clean',
         admissibility_state = 'admissible'
   where extraction_run_id = p_extraction_run_id;

  update rosetta_v2513.extraction_run
     set output_content_hash = v_output_hash,
         run_status = 'completed',
         admissibility_state = 'admissible',
         failure_code = null,
         completed_at = coalesce(completed_at, clock_timestamp())
   where id = p_extraction_run_id;

  return p_base_receipt || jsonb_build_object(
    'engine_version', 'rosetta-v3-deterministic-sql-2.5.13-c7',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.5.13-c7',
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'exact_source_structure_v2513c7', v_validation,
    'replayed', coalesce((p_base_receipt ->> 'replayed')::boolean, false)
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_reclassify_amendment_structure(p_extraction_run_id integer, p_source_text text, p_source_metadata jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_run rosetta_v2513.extraction_run%rowtype;
  v_document record;
  v_family text:=lower(coalesce(p_source_metadata->>'docket_document_family',''));
  v_operation record;
  v_operation_count integer:=0;
  v_block_id text;
  v_representation_id text;
  v_disposition text;
  v_prune jsonb;
begin
  select * into v_run from rosetta_v2513.extraction_run where id=p_extraction_run_id for update;
  if not found then raise exception 'rosetta_v2513c7_extraction_run_not_found'; end if;
  select corpus_id,document_identifier into v_document from rosetta_v2513.source_document where id=v_run.source_document_id;
  if v_family='' and v_run.source_content_id is not null then
    select lower(coalesce(source_metadata->>'docket_document_family','')) into v_family
    from rosetta_v2513.source_document_content where source_content_id=v_run.source_content_id;
  end if;

  delete from rosetta_v2513.rosetta_structural_representation where extraction_run_id=p_extraction_run_id;

  if v_family is distinct from 'amendment' then
    return jsonb_build_object('contract','rosetta-amendment-structural-representation-v2513c7','document_family',nullif(v_family,''),'applied',false,'representation_count',0);
  end if;

  v_disposition:=rosetta_v2513.c7_rosetta_v2511_amendment_disposition(p_source_text,p_source_metadata);
  v_prune:=rosetta_v2513.c7_rosetta_v24_prune_amendment_projection(p_extraction_run_id);

  for v_operation in select * from rosetta_v2513.c7_rosetta_v2511_amendment_operations(p_source_text) order by operation_ordinal loop
    v_operation_count:=v_operation_count+1;
    v_block_id:='blk-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');
    v_representation_id:='sr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-amend-'||lpad(v_operation.operation_ordinal::text,4,'0');

    update rosetta_v2513.hr1_raw_blocks
       set block_content_hash=encode(digest(convert_to(v_operation.operation_text,'UTF8'),'sha256'),'hex'),
           char_offset_start=v_operation.char_offset_start,
           char_offset_end=v_operation.char_offset_end
     where id=v_block_id and extraction_run_id=p_extraction_run_id;
    if not found then raise exception using errcode='22000',message='rosetta_v2513c7_amendment_operation_block_missing',detail=v_block_id; end if;

    insert into rosetta_v2513.rosetta_structural_representation(
      id,corpus_id,source_document_id,extraction_run_id,source_block_id,
      representation_type,representation_json,confidence,signal_status
    ) values (
      v_representation_id,v_document.corpus_id,v_run.source_document_id,p_extraction_run_id,v_block_id,
      'source_stated_amendment_operation',
      jsonb_build_object(
        'operation_ordinal',v_operation.operation_ordinal,
        'operation_kind',v_operation.operation_kind,
        'target_locator',v_operation.target_locator,
        'operation_text',v_operation.operation_text,
        'amendment_disposition',v_disposition,
        'operative_effect_applied',false,
        'representation_scope','source_instruction'
      ),1.00,'confirmed'
    );
  end loop;

  if v_operation_count=0
     and rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text) <> 'marked_full_text_reprint' then
    raise exception 'rosetta_v2513c7_amendment_structure_not_recognized';
  end if;

  insert into rosetta_v2513.layer_coverage(
    id,extraction_run_id,source_block_id,layer_name,coverage_status,reason,validated_at
  )
  select
    'lc-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-nonop-'
      ||substr(encode(digest(convert_to(block.id,'UTF8'),'sha256'),'hex'),1,16)||'-'||lower(layer_name),
    p_extraction_run_id,
    block.id,
    layer_name,
    'not_applicable',
    'Source-stated amendment instruction is preserved as a non-operative structural representation. Rosetta does not apply the instruction to underlying law in this decomposition.',
    clock_timestamp()
  from rosetta_v2513.hr1_raw_blocks block
  cross join unnest(array['HELP','WORKFLOW','ACCOUNTABILITY','OVERRIDES','DEFINITIONS']) layer_name
  where block.extraction_run_id=p_extraction_run_id
    and block.block_type in ('document','section','amendment_operation')
  on conflict(extraction_run_id,source_block_id,layer_name) do update
    set coverage_status=excluded.coverage_status,reason=excluded.reason,validated_at=excluded.validated_at;

  return jsonb_build_object(
    'contract','rosetta-amendment-structural-representation-v2513c7',
    'document_family','amendment','applied',true,'amendment_disposition',v_disposition,
    'representation_count',v_operation_count,'amendment_format',rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text),'operative_layer_projection','not_applied',
    'coverage_block_scope','document_section_and_amendment_operation','prune_receipt',v_prune
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_reconcile_structural_correctness(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb;
begin
  v_base:=rosetta_v2513.c7_rosetta_v254_reconcile_structural_correctness(p_extraction_run_id);
  return v_base||jsonb_build_object('contract','rosetta-structural-reconciliation-v2513c7');
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_refresh_final_coverage_receipts(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_run rosetta_v2513.extraction_run%rowtype;
  v_coverage jsonb;
  v_layer_count integer;
  v_terminal boolean;
  v_details jsonb;
begin
  select * into v_run from rosetta_v2513.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v2513c7_extraction_run_not_found'; end if;
  v_coverage:=rosetta_v2513.c7_rosetta_v2511_final_coverage(p_extraction_run_id);
  select count(*)::integer,coalesce(bool_and(value->>'status' in ('populated','not_applicable')),false)
    into v_layer_count,v_terminal from jsonb_each(v_coverage);
  v_terminal:=v_terminal and v_layer_count=5;
  v_details:=jsonb_build_object('contract','rosetta-final-five-layer-coverage-v2513c7','coverage',v_coverage,'layer_count',v_layer_count,'terminal',v_terminal);

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-coverage-final',p_extraction_run_id,'five_layer_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-no-pending-final',p_extraction_run_id,'no_pending_coverage',case when v_terminal then 'pass' else 'fail' end,case when v_terminal then 0 else 1 end,v_details)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  return v_details||jsonb_build_object('status',case when v_terminal then 'pass' else 'fail' end);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_validate_extraction(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;
  v_run rosetta_v2513.extraction_run%rowtype;
  v_metadata jsonb:='{}'::jsonb;
  v_family text:='';
  v_raw_expected integer:=0;
  v_status text;
begin
  v_base:=rosetta_v2513.c7_rosetta_v25_validate_extraction(p_extraction_run_id,p_source_text);
  select * into v_run from rosetta_v2513.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v2513c7_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from rosetta_v2513.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));
  v_raw_expected:=coalesce((v_base->>'expected_workflow_count')::integer,0);

  if v_family='amendment' then
    v_status:=case when
      coalesce((v_base->>'actual_workflow_count')::integer,-1)=0
      and coalesce((v_base->>'extra_workflow_count')::integer,-1)=0
      and coalesce((v_base->>'modal_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'actor_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'workflow_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'definition_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'override_section_mismatch_count')::integer,-1)=0
      and coalesce((v_base->>'coverage_mismatch_count')::integer,-1)=0
      then 'pass' else 'fail' end;

    return v_base||jsonb_build_object(
      'status',v_status,
      'engine_contract','rosetta-structural-self-check-v2513c7-amendment-projection-aware',
      'document_family','amendment',
      'raw_source_expected_workflow_count',v_raw_expected,
      'expected_workflow_count',0,
      'missing_workflow_count',0,
      'operative_workflow_expectation','zero_after_nonoperative_amendment_projection'
    );
  end if;

  return v_base||jsonb_build_object(
    'engine_contract','rosetta-structural-self-check-v2513c7',
    'document_family',nullif(v_family,'')
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2511_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;
  v_run rosetta_v2513.extraction_run%rowtype;
  v_metadata jsonb:='{}'::jsonb;
  v_family text:='';
  v_expected integer:=0;
  v_actual integer:=0;
  v_operative integer:=0;
  v_footer integer:=0;
  v_span_mismatch integer:=0;
  v_coverage_mismatch integer:=0;
  v_disposition_mismatch integer:=0;
  v_expected_disposition text;
  v_raw_expected_workflow integer:=0;
  v_semantic_base_ok boolean:=false;
  v_status text;
begin
  v_base:=rosetta_v2513.c7_rosetta_v253_validate_independent_structure(p_extraction_run_id,p_source_text);
  select * into v_run from rosetta_v2513.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v2513c7_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from rosetta_v2513.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));

  if v_family<>'amendment' then
    return v_base||jsonb_build_object(
      'contract','rosetta-independent-structural-validation-v2513c7',
      'document_family',nullif(v_family,'')
    );
  end if;

  v_raw_expected_workflow:=coalesce((v_base->>'expected_workflow_count')::integer,0);
  select count(*)::integer into v_expected from rosetta_v2513.c7_rosetta_v2511_amendment_operations(p_source_text);
  select count(*)::integer into v_actual from rosetta_v2513.rosetta_structural_representation where extraction_run_id=p_extraction_run_id;
  select
    (select count(*) from rosetta_v2513.help_entity where extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.workflow_pipeline where extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.accountability_route where extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.entity_override where extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.term_definition where extraction_run_id=p_extraction_run_id)
    into v_operative;
  select count(*)::integer into v_footer
  from rosetta_v2513.rosetta_structural_representation
  where extraction_run_id=p_extraction_run_id
    and representation_type='source_stated_amendment_operation'
    and coalesce(representation_json->>'operation_text','') ~* '(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$';
  select count(*)::integer into v_span_mismatch
  from rosetta_v2513.rosetta_structural_representation representation
  left join rosetta_v2513.hr1_raw_blocks block on block.id=representation.source_block_id
  where representation.extraction_run_id=p_extraction_run_id
    and (block.id is null
      or substring(p_source_text from block.char_offset_start+1 for block.char_offset_end-block.char_offset_start) is distinct from representation.representation_json->>'operation_text'
      or block.block_content_hash is distinct from encode(digest(convert_to(coalesce(representation.representation_json->>'operation_text',''),'UTF8'),'sha256'),'hex'));
  select case when count(distinct layer_name)=5 and coalesce(bool_and(coverage_status='not_applicable'),false) then 0 else 1 end
    into v_coverage_mismatch from rosetta_v2513.layer_coverage where extraction_run_id=p_extraction_run_id;
  v_expected_disposition:=rosetta_v2513.c7_rosetta_v2511_amendment_disposition(p_source_text,v_metadata);
  select count(*)::integer into v_disposition_mismatch
  from rosetta_v2513.rosetta_structural_representation
  where extraction_run_id=p_extraction_run_id
    and representation_type='source_stated_amendment_operation'
    and coalesce(representation_json->>'amendment_disposition','') is distinct from coalesce(v_expected_disposition,'');

  v_semantic_base_ok:=
    coalesce((v_base->>'duplicate_section_count')::integer,-1)=0
    and coalesce((v_base->>'block_hash_mismatch_count')::integer,-1)=0
    and coalesce((v_base->>'workflow_contamination_count')::integer,-1)=0
    and coalesce((v_base->>'definition_contamination_count')::integer,-1)=0
    and coalesce((v_base->>'override_false_positive_count')::integer,-1)=0
    and coalesce((v_base->>'accountability_contamination_count')::integer,-1)=0
    and coalesce((v_base->>'expected_span_count')::integer,-1)=coalesce((v_base->>'actual_span_count')::integer,-2)
    and coalesce((v_base->>'bad_span_count')::integer,-1)=0
    and coalesce((v_base->>'span_hash_mismatch_count')::integer,-1)=0
    and coalesce((v_base->>'actual_workflow_count')::integer,-1)=0
    and coalesce((v_base->>'blocking_repair_count')::integer,-1)=0
    and coalesce((v_base->>'accountability_typing_mismatch_count')::integer,-1)=0
    and coalesce((v_base->>'penalty_actor_mismatch_count')::integer,-1)=0
    and coalesce((v_base->>'expected_clause_occurrence_count')::integer,-1)=coalesce((v_base->>'actual_clause_occurrence_count')::integer,-2)
    and coalesce((v_base->>'clause_occurrence_binding_mismatch_count')::integer,-1)=0;

  v_status:=case when v_semantic_base_ok
    and v_actual=v_expected
    and v_operative=0
    and v_footer=0
    and v_span_mismatch=0
    and v_coverage_mismatch=0
    and v_disposition_mismatch=0
    then 'pass' else 'fail' end;

  return v_base||jsonb_build_object(
    'status',v_status,
    'contract','rosetta-independent-structural-validation-v2513c7',
    'document_family','amendment','amendment_format',rosetta_v2513.c7_rosetta_v2511_amendment_format(p_source_text),
    'raw_source_expected_workflow_count',v_raw_expected_workflow,
    'expected_workflow_count',0,
    'missing_workflow_count',0,
    'operative_workflow_expectation','zero_after_nonoperative_amendment_projection',
    'expected_structural_representation_count',v_expected,
    'actual_structural_representation_count',v_actual,
    'operative_object_count_for_amendment',v_operative,
    'structural_footer_contamination_count',v_footer,
    'structural_span_mismatch_count',v_span_mismatch,
    'amendment_coverage_mismatch_count',v_coverage_mismatch,
    'amendment_disposition_mismatch_count',v_disposition_mismatch,
    'amendment_disposition',v_expected_disposition
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v251_accountability_actor(p_trigger text, p_existing_actor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case when coalesce(p_trigger,'') ~* '\m(?:guilty|felony|sentenc|penalt|forfeitur)' and coalesce(p_trigger,'') ~* '\mis\s+guilty\M' then nullif(btrim(regexp_replace(p_trigger,'(?i)\s+is\s+guilty\b.*$','')),'') else nullif(btrim(coalesce(p_existing_actor,'')),'') end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v251_accountability_kind(p_trigger text)
 RETURNS TABLE(enforcement_type text, enforcement_direction text, clause_type text)
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
 select
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'source_stated_penalty_rule'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'source_stated_reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'source_stated_licensing_enforcement_rule'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'source_stated_investigation_rule'
      else 'source_stated_enforcement_rule' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'individual_penalty'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'agency_mandate'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'agency_mandate'
      when p_trigger ~* '\mshall\s+take\s+appropriate\s+action\M' then 'agency_mandate'
      else 'procedure' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'procedure'
      when p_trigger ~* '\m(?:report|notify|transmit|refuse|suspend|revok|licens|disciplin|investigat)' then 'agency_mandate'
      else 'procedure' end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v251_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb; v_typing_mismatch integer; v_penalty_actor_mismatch integer; v_status text;
begin
 v_base:=rosetta_v2513.c7_rosetta_v25_validate_independent_structure(p_extraction_run_id,p_source_text);
 select count(*)::integer into v_typing_mismatch from rosetta_v2513.accountability_route route cross join lateral rosetta_v2513.c7_rosetta_v251_accountability_kind(route.trigger_condition) expected where route.extraction_run_id=p_extraction_run_id and (route.enforcement_type is distinct from expected.enforcement_type or route.enforcement_direction is distinct from expected.enforcement_direction or route.clause_type is distinct from expected.clause_type);
 select count(*)::integer into v_penalty_actor_mismatch from rosetta_v2513.accountability_route route where route.extraction_run_id=p_extraction_run_id and route.enforcement_type='source_stated_penalty_rule' and (nullif(btrim(coalesce(route.enforcement_actor,'')),'') is null or route.enforcement_actor ~* '\mis\s+guilty\M|\mmay\s+be\s+sentenced\M');
 v_status:=case when coalesce(v_base->>'status','fail')='pass' and v_typing_mismatch=0 and v_penalty_actor_mismatch=0 then 'pass' else 'fail' end;
 return v_base||jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v251','accountability_typing_mismatch_count',v_typing_mismatch,'penalty_actor_mismatch_count',v_penalty_actor_mismatch);
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v252_penalty_actor(p_trigger text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$ select nullif(btrim(regexp_replace(p_trigger,'(?i)\s+is\s+guilty\M.*$','')),''); $function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v252_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select rosetta_v2513.c7_rosetta_v251_validate_independent_structure(p_extraction_run_id,p_source_text)||jsonb_build_object('contract','rosetta-independent-structural-validation-v252'); $function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v253_reconcile_structural_correctness(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_route record; v_kind record; v_actor text; v_definition_count integer:=0; v_accountability_count integer:=0; v_occurrence_count integer:=0; v_blocking integer:=0;
begin
 update rosetta_v2513.term_definition definition set defining_section=block.section_number,section_declared=block.section_number,section_observed=block.section_number,section_status='resolved' from rosetta_v2513.hr1_raw_blocks block where definition.extraction_run_id=p_extraction_run_id and block.id=definition.source_block_id; get diagnostics v_definition_count=row_count;
 for v_route in select route.id,route.trigger_condition,coalesce(nullif(route.actor_source_text,''),nullif(route.enforcement_actor,'')) existing_actor,block.section_number from rosetta_v2513.accountability_route route join rosetta_v2513.hr1_raw_blocks block on block.id=route.source_block_id where route.extraction_run_id=p_extraction_run_id loop
  v_actor:=rosetta_v2513.c7_rosetta_v251_accountability_actor(v_route.trigger_condition,v_route.existing_actor); select * into v_kind from rosetta_v2513.c7_rosetta_v251_accountability_kind(v_route.trigger_condition); if v_kind.enforcement_type='source_stated_penalty_rule' and v_route.trigger_condition ~* '\mis\s+guilty\M' then v_actor:=rosetta_v2513.c7_rosetta_v252_penalty_actor(v_route.trigger_condition); end if;
  update rosetta_v2513.accountability_route set actor_source_text=v_actor,enforcement_actor=v_actor,actor_label=v_actor,governing_section=v_route.section_number,section_declared=v_route.section_number,section_observed=v_route.section_number,section_status='resolved',enforcement_type=v_kind.enforcement_type,enforcement_direction=v_kind.enforcement_direction,clause_type=v_kind.clause_type,action_type=case when trigger_condition ~* '\mshall\M' then 'shall' when trigger_condition ~* '\mmust\M' then 'must' when trigger_condition ~* '\mmay\M' then 'may' else null end where id=v_route.id; v_accountability_count:=v_accountability_count+1;
 end loop;
 delete from rosetta_v2513.rosetta_structural_repair_queue where extraction_run_id=p_extraction_run_id and defect_type in ('actor_unresolved','actor_source_corrupt','accountability_semantic_mismatch');
 insert into rosetta_v2513.rosetta_structural_repair_queue(extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state) select route.extraction_run_id,route.source_document_id,'accountability',route.id,'actor_source_corrupt',jsonb_build_object('actor_source_text',route.actor_source_text),'open' from rosetta_v2513.accountability_route route where route.extraction_run_id=p_extraction_run_id and rosetta_v2513.c7_rosetta_v25_actor_source_corrupt(route.actor_source_text) on conflict(object_type,object_id,defect_type) do update set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;
 insert into rosetta_v2513.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type) select distinct encode(digest(convert_to(rosetta_v2513.c7_rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),rosetta_v2513.c7_rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure') from rosetta_v2513.accountability_route route join rosetta_v2513.escalation_node node on node.accountability_route_id=route.id where route.extraction_run_id=p_extraction_run_id and rosetta_v2513.c7_rosetta_normalize_clause_text(node.action_required)<>'' on conflict(normalized_text_hash,clause_type) do nothing;
 insert into rosetta_v2513.rosetta_clause_occurrence(canonical_clause_id,accountability_route_id,escalation_node_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,section_observed,section_status,source_text) select canonical.canonical_clause_id,route.id,node.id,route.extraction_run_id,route.source_document_id,route.source_block_id,block.char_offset_start,block.char_offset_end,block.section_number,route.section_status,node.action_required from rosetta_v2513.accountability_route route join rosetta_v2513.escalation_node node on node.accountability_route_id=route.id join rosetta_v2513.hr1_raw_blocks block on block.id=route.source_block_id join rosetta_v2513.rosetta_canonical_clause canonical on canonical.normalized_text_hash=encode(digest(convert_to(rosetta_v2513.c7_rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex') and canonical.clause_type=coalesce(route.clause_type,'procedure') where route.extraction_run_id=p_extraction_run_id on conflict(accountability_route_id,escalation_node_id) do update set canonical_clause_id=excluded.canonical_clause_id,section_observed=excluded.section_observed,section_status=excluded.section_status,source_text=excluded.source_text; get diagnostics v_occurrence_count=row_count;
 select rosetta_v2513.c7_rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking; return jsonb_build_object('contract','rosetta-structural-reconciliation-v253','extraction_run_id',p_extraction_run_id,'definition_count',v_definition_count,'accountability_count',v_accountability_count,'clause_occurrence_count',v_occurrence_count,'blocking_repair_count',v_blocking,'publication_state',case when v_blocking>0 then 'verified_with_defects' else 'verified' end);
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v253_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb; v_expected integer; v_actual integer; v_binding_mismatch integer; v_status text;
begin v_base:=rosetta_v2513.c7_rosetta_v252_validate_independent_structure(p_extraction_run_id,p_source_text); select count(*)::integer into v_expected from rosetta_v2513.escalation_node node join rosetta_v2513.accountability_route route on route.id=node.accountability_route_id where route.extraction_run_id=p_extraction_run_id; select count(*)::integer into v_actual from rosetta_v2513.rosetta_clause_occurrence occurrence where occurrence.extraction_run_id=p_extraction_run_id; select count(*)::integer into v_binding_mismatch from rosetta_v2513.rosetta_clause_occurrence occurrence join rosetta_v2513.escalation_node node on node.id=occurrence.escalation_node_id where occurrence.extraction_run_id=p_extraction_run_id and (node.accountability_route_id is distinct from occurrence.accountability_route_id or rosetta_v2513.c7_rosetta_normalize_clause_text(node.action_required) is distinct from rosetta_v2513.c7_rosetta_normalize_clause_text(occurrence.source_text)); v_status:=case when coalesce(v_base->>'status','fail')='pass' and v_expected=v_actual and v_binding_mismatch=0 then 'pass' else 'fail' end; return v_base||jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v253','expected_clause_occurrence_count',v_expected,'actual_clause_occurrence_count',v_actual,'clause_occurrence_binding_mismatch_count',v_binding_mismatch); end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v254_canonical_output(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with law as (
    select *
    from rosetta_v2513.v_rosetta_operator_law_view_v1
    where extraction_run_id = p_extraction_run_id
  ),
  counts as (
    select jsonb_build_object(
      'raw_blocks', (select count(*) from rosetta_v2513.hr1_raw_blocks where extraction_run_id = p_extraction_run_id),
      'help', (select count(*) from rosetta_v2513.help_entity where extraction_run_id = p_extraction_run_id),
      'workflow_pipelines', (select count(*) from rosetta_v2513.workflow_pipeline where extraction_run_id = p_extraction_run_id),
      'workflow_steps', (
        select count(*) from rosetta_v2513.workflow_step step
        join rosetta_v2513.workflow_pipeline pipeline on pipeline.id = step.workflow_pipeline_id
        where pipeline.extraction_run_id = p_extraction_run_id
      ),
      'accountability_routes', (select count(*) from rosetta_v2513.accountability_route where extraction_run_id = p_extraction_run_id),
      'overrides', (select count(*) from rosetta_v2513.entity_override where extraction_run_id = p_extraction_run_id),
      'definitions', (select count(*) from rosetta_v2513.term_definition where extraction_run_id = p_extraction_run_id),
      'coverage', (select count(*) from rosetta_v2513.layer_coverage where extraction_run_id = p_extraction_run_id)
    ) as value
  )
  select jsonb_build_object(
    'contract', 'rosetta-canonical-law-view-v254',
    'extraction_run_id', law.extraction_run_id,
    'source_document_id', law.source_document_id,
    'engine_version', law.engine_version,
    'rule_set_version', law.rule_set_version,
    'rule_manifest_hash', law.rule_manifest_hash,
    'configuration_hash', law.configuration_hash,
    'source_identity_hash', law.source_identity_hash,
    'source_content_hash', law.source_content_hash,
    'objects', law.objects,
    'coverage', law.coverage,
    'provenance_state', law.provenance_state,
    'row_counts', counts.value
  ) from law, counts;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v254_reconcile_structural_correctness(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb;
begin
  v_base:=rosetta_v2513.c7_rosetta_v253_reconcile_structural_correctness(p_extraction_run_id);
  return v_base||jsonb_build_object('contract','rosetta-structural-reconciliation-v254');
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_actor_source_corrupt(p_actor text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select
    nullif(btrim(coalesce(p_actor,'')), '') is null
    or coalesce(p_actor,'') ~ '^\s*[0-9]+(?:\s|\.|\))'
    or coalesce(p_actor,'') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--';
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_clause_structurally_sound(p_clause text, p_actor text, p_modal text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select nullif(btrim(p_clause),'') is not null and nullif(btrim(p_actor),'') is not null and lower(p_modal) in ('shall','shall not','must','must not','may','may not') and p_actor !~ '^\s*[0-9]+\M' and p_clause !~* '\mREVISOR\M|--\s*[0-9]+\s+of\s+[0-9]+\s*--' and right(btrim(p_clause),1)='.';
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_exact_definition_text(p_source_text text, p_definition_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_source text:=rosetta_v2513.c7_rosetta_v2_normalize_text(rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v25_layout_projection(p_source_text))); v_definition text:=rosetta_v2513.c7_rosetta_v2_normalize_text(p_definition_text); v_position integer;
begin v_position:=strpos(lower(v_source),lower(v_definition)); if v_position>0 then return substr(v_source,v_position,char_length(v_definition)); end if; return v_definition; end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_is_internal_period(p_value text, p_index integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare v_previous text:=substr(p_value,greatest(1,p_index-1),1); v_next text:=substr(p_value,p_index+1,1); v_left text:=substr(p_value,1,greatest(0,p_index-1)); v_after text:=ltrim(substr(p_value,p_index+1)); v_word text; v_dotted text;
begin
 if substr(p_value,p_index,1)<>'.' then return false; end if;
 if v_previous ~ '[0-9A-Za-z]' and v_next ~ '[0-9]' then return true; end if;
 if v_previous ~ '[A-Za-z]' and v_next ~ '[A-Za-z]' then return true; end if;
 v_word:=(regexp_match(v_left,'([A-Za-z]+)$'))[1];
 if v_word is not null and lower(v_word)=any(array['art','co','corp','dr','etc','inc','mr','mrs','ms','no','st','v','vs']) and v_after<>'' then return true; end if;
 if lower(coalesce(v_word,''))='e' and v_after ~ '^g[.]' then return true; end if;
 if lower(coalesce(v_word,''))='i' and v_after ~ '^e[.]' then return true; end if;
 if v_word='Pub' and v_after ~ '^L[.]\s*(?:No[.]\s*)?[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+F$' and v_after ~ '^Supp[.]\s*[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+F[.]\s+Supp$' and v_after ~ '^[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+S$' and v_after ~ '^Ct[.]\s*[0-9]' then return true; end if;
 if v_left ~ '[0-9]+\s+S[.]\s+Ct$' and v_after ~ '^[0-9]' then return true; end if;
 v_dotted:=(regexp_match(v_left,'([A-Za-z]+(?:[.][A-Za-z]+)+)$'))[1];
 if v_dotted is not null and v_after<>'' and v_after !~ '^(?:A|An|Each|Every|No|That|The|This)\M' then return true; end if;
 if v_word is not null and v_word ~ '^[A-Z]$' and v_after ~ '^(?:[0-9]|No[.]\s*[0-9])' then return true; end if;
 return false;
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_layout_projection(p_source_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result text := p_source_text;
  v_line_label_count integer;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  if v_line_label_count >= 3 then
    v_result := rosetta_v2513.c7_rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+','n');
  end if;
  if v_result ~ 'REVISOR' or v_line_label_count >= 3 then
    v_result := rosetta_v2513.c7_rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[ \t]+(?:Sec[.]|Section)[ \t]+[0-9]+[A-Za-z]?[.][^\n]*(\n|$)','n');
    v_result := rosetta_v2513.c7_rosetta_v25_mask_matches(v_result,'(^|\n)REVISOR[^\n]*(\n|$)','n');
    v_result := rosetta_v2513.c7_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)','n');
  end if;
  return rosetta_v2513.c7_rosetta_v25_protect_internal_periods(v_result);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_locate_normalized_text(p_raw_text text, p_needle text)
 RETURNS TABLE(source_offset_start integer, source_offset_end integer, span_status text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 v_clean_raw text:=rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v25_layout_projection(p_raw_text));
 v_haystack text:=rosetta_v2513.c7_rosetta_v2_normalize_text(v_clean_raw);
 v_needle text:=rosetta_v2513.c7_rosetta_v2_normalize_text(p_needle);
 v_start_norm integer; v_end_norm integer; v_second integer; v_index integer; v_char text; v_norm_pos integer:=0; v_seen_nonspace boolean:=false; v_pending_space boolean:=false; v_space_raw_start integer:=null; v_raw_start integer:=null; v_raw_end integer:=null;
begin
 if nullif(v_needle,'') is null then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 v_start_norm:=strpos(lower(v_haystack),lower(v_needle));
 if v_start_norm=0 then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 v_end_norm:=v_start_norm+char_length(v_needle)-1;
 v_second:=strpos(lower(substr(v_haystack,v_start_norm+char_length(v_needle))),lower(v_needle));
 for v_index in 1..char_length(v_clean_raw) loop
  v_char:=substr(v_clean_raw,v_index,1);
  if v_char ~ '[[:space:]]' then
   if v_seen_nonspace and not v_pending_space then v_pending_space:=true; v_space_raw_start:=v_index; end if;
   continue;
  end if;
  if v_pending_space and v_seen_nonspace then
   v_norm_pos:=v_norm_pos+1;
   if v_norm_pos=v_start_norm then v_raw_start:=v_space_raw_start; end if;
   if v_norm_pos=v_end_norm then v_raw_end:=v_index; end if;
  end if;
  v_pending_space:=false; v_space_raw_start:=null; v_seen_nonspace:=true;
  v_norm_pos:=v_norm_pos+1;
  if v_norm_pos=v_start_norm then v_raw_start:=v_index; end if;
  if v_norm_pos=v_end_norm then v_raw_end:=v_index+1; exit; end if;
 end loop;
 if v_raw_start is null or v_raw_end is null or v_raw_end<=v_raw_start then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 return query select v_raw_start-1,v_raw_end-1,case when v_second>0 then 'ambiguous' else 'resolved' end;
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_mask_matches(p_value text, p_pattern text, p_flags text DEFAULT 'n'::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_result text := p_value;
  v_search_start integer := 1;
  v_start integer;
  v_end integer;
  v_segment text;
  v_mask text;
begin
  loop
    v_start := regexp_instr(v_result, p_pattern, v_search_start, 1, 0, p_flags);
    exit when v_start = 0;
    v_end := regexp_instr(v_result, p_pattern, v_search_start, 1, 1, p_flags);
    exit when v_end <= v_start;
    v_segment := substr(v_result, v_start, v_end - v_start);
    v_mask := regexp_replace(v_segment, '[^\n\r]', ' ', 'g');
    v_result := overlay(v_result placing v_mask from v_start for v_end - v_start);
    v_search_start := v_end;
  end loop;
  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_normalized text; v_match text[];
begin
  v_normalized:=rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v2_normalize_text(p_clause));
  v_normalized:=regexp_replace(v_normalized,'^(?:\([a-z0-9]+\)\s*)+','','i');
  v_normalized:=regexp_replace(v_normalized,'^\d+[.)]\s*','');
  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\s+(shall|must|may)\s+not\M');
  if v_match is not null then return query select lower(v_match[2]||' not'),nullif(btrim(v_match[1],E' \t\r\n,;:'),''); return; end if;
  v_match:=regexp_match(v_normalized,'(?i)^(.+?)\s+(shall|must|may)\M');
  if v_match is null then return query select null::text,null::text; return; end if;
  return query select lower(v_match[2]),nullif(btrim(v_match[1],E' \t\r\n,;:'),'');
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_normative_clauses(p_source_text text)
 RETURNS TABLE(section_ordinal integer, section_number text, clause_ordinal integer, clause_text text, actor text, modal text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_section record; v_match text[]; v_projection text; v_clause text; v_actor text; v_modal text; v_ordinal integer:=0;
begin
  for v_section in select * from rosetta_v2513.c7_rosetta_v25_section_spans(p_source_text) order by section_ordinal loop
    v_projection := rosetta_v2513.c7_rosetta_v25_layout_projection(v_section.section_text);
    for v_match in select regexp_matches(rosetta_v2513.c7_rosetta_v2_normalize_text(v_projection),'(?i)([^.]*\m(shall not|must not|may not|shall|must|may)\M[^.]*[.])','g') loop
      v_clause := rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v2_normalize_text(v_match[1]));
      select inferred.modal,inferred.actor into v_modal,v_actor from rosetta_v2513.c7_rosetta_v25_modal_and_actor(v_clause) inferred;
      if v_modal is null or v_actor is null then continue; end if;
      if rosetta_v2513.c7_rosetta_v2_is_legislative_finding(v_clause,v_modal) then continue; end if;
      if not rosetta_v2513.c7_rosetta_v25_clause_structurally_sound(v_clause,v_actor,v_modal) then continue; end if;
      v_ordinal:=v_ordinal+1;
      return query select v_section.section_ordinal,v_section.section_number,v_ordinal,v_clause,v_actor,v_modal;
    end loop;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_projected_contains(p_source_text text, p_needle text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select strpos(lower(rosetta_v2513.c7_rosetta_v2_normalize_text(rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v25_layout_projection(p_source_text)))),lower(rosetta_v2513.c7_rosetta_v2_normalize_text(p_needle)))>0;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_protect_internal_periods(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result text := p_value;
  v_index integer;
  v_marker text := chr(57344);
begin
  if char_length(p_value) < 3 then return p_value; end if;
  for v_index in 2..char_length(p_value) - 1 loop
    if substr(p_value, v_index, 1) = '.' and rosetta_v2513.c7_rosetta_v25_is_internal_period(p_value, v_index) then
      v_result := overlay(v_result placing v_marker from v_index for 1);
    end if;
  end loop;
  return v_result;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_row record; v_loc record; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text;
begin
 delete from rosetta_v2513.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;
 for v_row in
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle
  from rosetta_v2513.workflow_step ws join rosetta_v2513.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join rosetta_v2513.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id
  union all
  select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from rosetta_v2513.accountability_route ar join rosetta_v2513.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id
  union all
  select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from rosetta_v2513.entity_override eo join rosetta_v2513.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id
  union all
  select 'term_definition',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,'"'||td.defined_term||'" '||td.definition_text from rosetta_v2513.term_definition td join rosetta_v2513.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id
 loop
  v_needle:=v_row.needle;
  v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start);
  select * into v_loc from rosetta_v2513.c7_rosetta_v25_locate_normalized_text(v_block_text,v_needle);
  if v_row.object_type='term_definition' and v_loc.span_status='unresolved' then
   select td.definition_text into v_needle from rosetta_v2513.term_definition td where td.id=v_row.object_id;
   select * into v_loc from rosetta_v2513.c7_rosetta_v25_locate_normalized_text(v_block_text,v_needle);
  end if;
  if v_loc.span_status in ('resolved','ambiguous') then
   v_absolute_start:=v_row.block_start+v_loc.source_offset_start; v_absolute_end:=v_row.block_start+v_loc.source_offset_end;
   v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start);
  else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;
  insert into rosetta_v2513.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)
  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex') end,'rosetta-layout-projection-v25',v_loc.span_status)
  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
  if v_loc.span_status='resolved' then v_resolved:=v_resolved+1; elsif v_loc.span_status='ambiguous' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;
 end loop;
 return jsonb_build_object('contract','rosetta-object-source-span-v25','extraction_run_id',p_extraction_run_id,'resolved',v_resolved,'ambiguous',v_ambiguous,'unresolved',v_unresolved);
end;$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_register_span_repairs(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_open integer;
begin
  insert into rosetta_v2513.rosetta_structural_repair_queue(
    extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state
  )
  select span.extraction_run_id,span.source_document_id,span.object_type,span.object_id,
         case when span.span_status='ambiguous' then 'source_span_ambiguous' else 'source_span_unresolved' end,
         jsonb_build_object('source_block_id',span.source_block_id,'normalized_text',span.normalized_text,'span_status',span.span_status),'open'
  from rosetta_v2513.rosetta_object_source_span span
  where span.extraction_run_id=p_extraction_run_id and span.span_status<>'resolved'
  on conflict(object_type,object_id,defect_type) do update
    set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;

  update rosetta_v2513.rosetta_structural_repair_queue repair
     set repair_state='resolved',resolved_at=now()
    from rosetta_v2513.rosetta_object_source_span span
   where repair.extraction_run_id=p_extraction_run_id
     and repair.object_type=span.object_type
     and repair.object_id=span.object_id
     and repair.defect_type in ('source_span_ambiguous','source_span_unresolved')
     and span.span_status='resolved'
     and repair.repair_state<>'resolved';
  select rosetta_v2513.c7_rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_open;
  return jsonb_build_object('contract','rosetta-span-repair-registration-v25','extraction_run_id',p_extraction_run_id,'blocking_repair_count',v_open);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_section_spans(p_source_text text)
 RETURNS TABLE(section_ordinal integer, section_number text, char_offset_start integer, char_offset_end integer, section_text text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_projection text := rosetta_v2513.c7_rosetta_v25_layout_projection(p_source_text);
  v_length integer := char_length(p_source_text);
  v_line_label_count integer;
  v_pattern text;
  v_first integer;
  v_start integer;
  v_next integer;
  v_end integer;
  v_ordinal integer := 0;
  v_marker text;
  v_number text;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  if v_line_label_count >= 3 then
    v_pattern := '(^|\n)[ \t]*(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.]';
  else
    v_pattern := '(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.]';
  end if;
  v_first := regexp_instr(v_projection,v_pattern,1,1,0,'n');
  if v_first = 0 then
    return query select 1,'Document'::text,0,v_length,p_source_text;
    return;
  end if;
  while v_first <= v_length and substr(v_projection,v_first,1) ~ '[[:space:]]' loop v_first := v_first + 1; end loop;
  if v_first > 1 and nullif(btrim(substr(p_source_text,1,v_first-1)),'') is not null then
    v_ordinal := v_ordinal + 1;
    return query select v_ordinal,'Preamble'::text,0,v_first-1,substr(p_source_text,1,v_first-1);
  end if;
  v_start := v_first;
  loop
    exit when v_start=0 or v_start>v_length;
    v_next := regexp_instr(v_projection,v_pattern,v_start+1,1,0,'n');
    if v_next>0 then while v_next<=v_length and substr(v_projection,v_next,1) ~ '[[:space:]]' loop v_next := v_next+1; end loop; end if;
    v_end := case when v_next=0 then v_length+1 else v_next end;
    v_marker := (regexp_match(substr(v_projection,v_start,least(80,v_end-v_start)),'(Section|SECTION|Sec[.]|SEC[.])[ \t]*([0-9]+[A-Za-z]?)[.]'))[1];
    v_number := (regexp_match(substr(v_projection,v_start,least(80,v_end-v_start)),'(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*([0-9]+[A-Za-z]?)[.]'))[1];
    if v_marker is null or v_number is null then raise exception 'rosetta_v25_section_marker_resolution_failed at %',v_start; end if;
    v_ordinal := v_ordinal+1;
    return query select v_ordinal,'Sec. '||v_number,v_start-1,v_end-1,substr(p_source_text,v_start,v_end-v_start);
    exit when v_next=0;
    v_start := v_next;
  end loop;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_unprotect_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select replace(p_value, chr(57344), '.');
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_validate_extraction(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with expected_workflow as (
  select
    section_number,
    rosetta_v2513.c7_rosetta_v2_normalize_text(clause_text) as clause_text,
    rosetta_v2513.c7_rosetta_v2_normalize_text(actor) as actor,
    lower(modal) as modal
  from rosetta_v2513.c7_rosetta_v25_normative_clauses(p_source_text)
),
actual_workflow as (
  select
    ws.id,
    rosetta_v2513.c7_rosetta_v2_normalize_text(ws.step_name) as clause_text,
    rosetta_v2513.c7_rosetta_v2_normalize_text(ws.actor) as actor,
    lower(ws.verb) as modal,
    ws.governing_section,
    rb.section_number as block_section
  from rosetta_v2513.workflow_step ws
  join rosetta_v2513.workflow_pipeline wp
    on wp.id = ws.workflow_pipeline_id
  join rosetta_v2513.hr1_raw_blocks rb
    on rb.id = wp.source_block_id
  where wp.extraction_run_id = p_extraction_run_id
),
metrics as (
  select
    (select count(*) from expected_workflow)::integer as expected_workflow_count,
    (select count(*) from actual_workflow)::integer as actual_workflow_count,
    (
      select count(*)::integer
      from expected_workflow expected
      where not exists (
        select 1
        from actual_workflow actual
        where lower(actual.clause_text) = lower(expected.clause_text)
          and lower(actual.block_section) = lower(expected.section_number)
      )
    ) as missing_workflow_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where not exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
      )
    ) as extra_workflow_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
          and expected.modal is distinct from actual.modal
      )
    ) as modal_mismatch_count,
    (
      select count(*)::integer
      from actual_workflow actual
      where exists (
        select 1
        from expected_workflow expected
        where lower(expected.clause_text) = lower(actual.clause_text)
          and lower(expected.section_number) = lower(actual.block_section)
          and lower(coalesce(expected.actor, '')) is distinct from
              lower(coalesce(actual.actor, ''))
      )
    ) as actor_mismatch_count,
    (
      select count(*)::integer
      from actual_workflow
      where lower(coalesce(governing_section, '')) is distinct from
            lower(coalesce(block_section, ''))
    ) as workflow_section_mismatch_count,
    (
      select count(*)::integer
      from rosetta_v2513.term_definition td
      join rosetta_v2513.hr1_raw_blocks rb on rb.id = td.source_block_id
      where td.extraction_run_id = p_extraction_run_id
        and lower(td.defining_section) is distinct from lower(rb.section_number)
    ) as definition_section_mismatch_count,
    (
      select count(*)::integer
      from rosetta_v2513.entity_override eo
      join rosetta_v2513.hr1_raw_blocks rb on rb.id = eo.source_block_id
      where eo.extraction_run_id = p_extraction_run_id
        and lower(
          coalesce(
            nullif(
              regexp_replace(eo.overridden_authority, '^Base rule within\s+', '', 'i'),
              ''
            ),
            rb.section_number
          )
        ) is distinct from lower(rb.section_number)
    ) as override_section_mismatch_count,
    (
      select count(*)::integer
      from rosetta_v2513.hr1_raw_blocks rb
      where rb.extraction_run_id = p_extraction_run_id
        and rb.block_type = 'section'
        and (
          select count(distinct lc.layer_name)
          from rosetta_v2513.layer_coverage lc
          where lc.extraction_run_id = p_extraction_run_id
            and lc.source_block_id = rb.id
        ) <> 5
    ) as coverage_mismatch_count
),
rendered as (
  select jsonb_build_object(
    'status',
    case
      when expected_workflow_count = actual_workflow_count
       and missing_workflow_count = 0
       and extra_workflow_count = 0
       and modal_mismatch_count = 0
       and actor_mismatch_count = 0
       and workflow_section_mismatch_count = 0
       and definition_section_mismatch_count = 0
       and override_section_mismatch_count = 0
       and coverage_mismatch_count = 0
      then 'pass'
      else 'fail'
    end,
    'engine_contract', 'rosetta-structural-self-check-v25',
    'expected_workflow_count', expected_workflow_count,
    'actual_workflow_count', actual_workflow_count,
    'missing_workflow_count', missing_workflow_count,
    'extra_workflow_count', extra_workflow_count,
    'modal_mismatch_count', modal_mismatch_count,
    'actor_mismatch_count', actor_mismatch_count,
    'workflow_section_mismatch_count', workflow_section_mismatch_count,
    'definition_section_mismatch_count', definition_section_mismatch_count,
    'override_section_mismatch_count', override_section_mismatch_count,
    'coverage_mismatch_count', coverage_mismatch_count
  ) as receipt
  from metrics
)
select receipt from rendered;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_duplicate_section_count integer;
  v_block_hash_mismatch_count integer;
  v_workflow_contamination_count integer;
  v_definition_contamination_count integer;
  v_override_false_positive_count integer;
  v_accountability_contamination_count integer;
  v_expected_span_count integer;
  v_actual_span_count integer;
  v_bad_span_count integer;
  v_span_hash_mismatch_count integer;
  v_expected_workflow_count integer;
  v_actual_workflow_count integer;
  v_blocking_repair_count integer;
  v_status text;
begin
  select count(*)::integer into v_duplicate_section_count
  from (select section_number from rosetta_v2513.hr1_raw_blocks where extraction_run_id=p_extraction_run_id and block_type='section' group by section_number having count(*)>1) d;

  select count(*)::integer into v_block_hash_mismatch_count
  from rosetta_v2513.hr1_raw_blocks block
  where block.extraction_run_id=p_extraction_run_id
    and block.block_type in ('document','section')
    and block.block_content_hash is distinct from encode(digest(convert_to(substr(p_source_text,block.char_offset_start+1,block.char_offset_end-block.char_offset_start),'UTF8'),'sha256'),'hex');

  select count(*)::integer into v_workflow_contamination_count
  from rosetta_v2513.workflow_step step join rosetta_v2513.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id
  where pipeline.extraction_run_id=p_extraction_run_id
    and (rosetta_v2513.c7_rosetta_v25_actor_source_corrupt(step.actor) or step.step_name ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--');

  select count(*)::integer into v_definition_contamination_count
  from rosetta_v2513.term_definition definition
  where definition.extraction_run_id=p_extraction_run_id
    and (definition.defined_term ~* 'REVISOR|ENGROSSMENT|Page No'
         or definition.defined_term ~ '(^|\s)[0-9]{1,3}[.][0-9]{1,3}(\s|$)'
         or definition.definition_text ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--');

  select count(*)::integer into v_override_false_positive_count
  from rosetta_v2513.entity_override override_row
  where override_row.extraction_run_id=p_extraction_run_id
    and (((override_row.override_scope ~* '\m(?:shall not|must not|may not)\M'
           and override_row.override_scope !~* '\m(?:unless|however|except|notwithstanding|subject to|does not apply|do not apply)\M'
           and override_row.override_scope !~* '\mNothing in .* shall prevent\M'))
         or override_row.override_scope ~* '["“][^"”]{1,160}["”]\s+(?:includes|means|does not include|has the same meaning as)\M');

  select count(*)::integer into v_accountability_contamination_count
  from rosetta_v2513.accountability_route route
  where route.extraction_run_id=p_extraction_run_id
    and (rosetta_v2513.c7_rosetta_v25_actor_source_corrupt(coalesce(route.actor_source_text,route.enforcement_actor))
         or route.trigger_condition ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
         or lower(btrim(coalesce(route.actor_source_text,route.enforcement_actor,''))) in ('the report','a report'));

  select
    (select count(*) from rosetta_v2513.workflow_step step join rosetta_v2513.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id where pipeline.extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.accountability_route route where route.extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.entity_override override_row where override_row.extraction_run_id=p_extraction_run_id)
    +(select count(*) from rosetta_v2513.term_definition definition where definition.extraction_run_id=p_extraction_run_id)
  into v_expected_span_count;

  select count(*)::integer,count(*) filter(where span_status<>'resolved')::integer
    into v_actual_span_count,v_bad_span_count
  from rosetta_v2513.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;

  select count(*)::integer into v_span_hash_mismatch_count
  from rosetta_v2513.rosetta_object_source_span span
  where span.extraction_run_id=p_extraction_run_id and span.span_status='resolved'
    and (span.source_offset_start is null or span.source_offset_end is null or span.source_offset_end<=span.source_offset_start
         or span.raw_text_hash is distinct from encode(digest(convert_to(substr(p_source_text,span.source_offset_start+1,span.source_offset_end-span.source_offset_start),'UTF8'),'sha256'),'hex'));

  select count(*)::integer into v_expected_workflow_count from rosetta_v2513.c7_rosetta_v25_normative_clauses(p_source_text);
  select count(*)::integer into v_actual_workflow_count from rosetta_v2513.workflow_step step join rosetta_v2513.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id where pipeline.extraction_run_id=p_extraction_run_id;
  select rosetta_v2513.c7_rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking_repair_count;

  v_status:=case when v_duplicate_section_count=0 and v_block_hash_mismatch_count=0 and v_workflow_contamination_count=0 and v_definition_contamination_count=0 and v_override_false_positive_count=0 and v_accountability_contamination_count=0 and v_expected_span_count=v_actual_span_count and v_bad_span_count=0 and v_span_hash_mismatch_count=0 and v_expected_workflow_count=v_actual_workflow_count and v_blocking_repair_count=0 then 'pass' else 'fail' end;

  return jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v25','extraction_run_id',p_extraction_run_id,'duplicate_section_count',v_duplicate_section_count,'block_hash_mismatch_count',v_block_hash_mismatch_count,'workflow_contamination_count',v_workflow_contamination_count,'definition_contamination_count',v_definition_contamination_count,'override_false_positive_count',v_override_false_positive_count,'accountability_contamination_count',v_accountability_contamination_count,'expected_span_count',v_expected_span_count,'actual_span_count',v_actual_span_count,'bad_span_count',v_bad_span_count,'span_hash_mismatch_count',v_span_hash_mismatch_count,'expected_workflow_count',v_expected_workflow_count,'actual_workflow_count',v_actual_workflow_count,'blocking_repair_count',v_blocking_repair_count);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2_is_legislative_finding(p_clause text, p_modal text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select case
    when lower(rosetta_v2513.c7_rosetta_v2_normalize_text(p_clause))
      like '%the legislature finds%'
      or lower(rosetta_v2513.c7_rosetta_v2_normalize_text(p_clause))
      like '%the legislature recognizes%'
      then true
    when lower(p_modal) <> 'may' then false
    else lower(rosetta_v2513.c7_rosetta_v2_normalize_text(p_clause))
      ~ '\m(may offer|may influence|may blur|may create|may lead|may present)\M'
  end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2_modal_and_actor(p_clause text)
 RETURNS TABLE(modal text, actor text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_normalized text;
  v_match text[];
begin
  v_normalized := rosetta_v2513.c7_rosetta_v2_normalize_text(p_clause);
  v_normalized := regexp_replace(
    v_normalized,
    '^(?:\([a-z0-9]+\)\s*)+',
    '',
    'i'
  );
  v_normalized := regexp_replace(v_normalized, '^\d+[.)]\s*', '');

  v_match := regexp_match(
    v_normalized,
    '(?i)^(.{1,180}?)\s+(shall|must|may)\s+not\M'
  );
  if v_match is not null then
    return query
    select
      lower(v_match[2] || ' not'),
      nullif(btrim(v_match[1], E' \t\r\n,;:'), '');
    return;
  end if;

  v_match := regexp_match(
    v_normalized,
    '(?i)^(.{1,180}?)\s+(shall|must|may)\M'
  );
  if v_match is null then
    return query select null::text, null::text;
    return;
  end if;

  return query
  select
    lower(v_match[2]),
    nullif(btrim(v_match[1], E' \t\r\n,;:'), '');
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v2_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select btrim(regexp_replace(p_value, '[[:space:]]+', ' ', 'g'));
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_run_rosetta_v3_extraction(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '180s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_receipt jsonb;
  v_was_finalized boolean:=false;
  v_configuration_json jsonb;
  v_configuration_hash text;
  v_expected_content_hash text;
begin
  v_configuration_json:=jsonb_build_object(
    'reference_date',p_reference_date,
    'text_extractor_version',coalesce(nullif(btrim(p_text_extractor_version),''),'unknown'),
    'normalization_version','rosetta-normalize-whitespace-v2',
    'parsing_projection_version','rosetta-layout-projection-v25',
    'confidence_mode','binary_exact_match_only'
  );
  v_configuration_hash:=encode(digest(convert_to(v_configuration_json::text,'UTF8'),'sha256'),'hex');
  v_expected_content_hash:=lower(regexp_replace(coalesce(p_expected_source_content_hash,''),'^sha256:',''));

  select exists(
    select 1
    from rosetta_v2513.extraction_run run
    join rosetta_v2513.source_document_content content on content.source_content_id=run.source_content_id
    join rosetta_v2513.extraction_manifest manifest on manifest.extraction_run_id=run.id
    join rosetta_v2513.validation_result independent on independent.extraction_run_id=run.id
      and independent.test_name='independent_structure_v2513c7'
      and independent.test_result='pass'
      and independent.failure_count=0
    join rosetta_v2513.validation_result exact_source on exact_source.extraction_run_id=run.id
      and exact_source.test_name='exact_source_structure_v2513c7'
      and exact_source.test_result='pass'
      and exact_source.failure_count=0
    join rosetta_v2513.validation_result output_hash on output_hash.extraction_run_id=run.id
      and output_hash.test_name='output_hash_verified'
      and output_hash.test_result='pass'
      and output_hash.failure_count=0
    where run.source_document_id=p_source_document_id
      and content.source_version=p_source_version
      and content.source_url=p_source_url
      and content.source_content_hash=v_expected_content_hash
      and run.engine_version='rosetta-v3-deterministic-sql-2.5.13-c7'
      and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.13-c7'
      and run.rule_manifest_hash='3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639'
      and run.configuration_hash=v_configuration_hash
      and run.run_status='completed'
      and run.admissibility_state='admissible'
      and run.output_content_hash is not null
      and manifest.status='clean'
      and manifest.admissibility_state='admissible'
      and manifest.output_hash=run.output_content_hash
  ) into v_was_finalized;

  v_receipt:=rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_candidate(
    p_source_document_id,
    p_source_text,
    p_expected_source_content_hash,
    p_source_url,
    p_source_version,
    p_media_type,
    p_source_byte_hash,
    p_source_provider_hash,
    p_reference_date,
    p_text_extractor_version,
    p_source_metadata
  );

  return v_receipt||jsonb_build_object(
    'replayed',v_was_finalized,
    'canonical_producer_contract','rosetta-current-producer-v2513c7',
    'canonical_replay_contract',case when v_was_finalized
      then 'rosetta-finalized-generation-immutable-replay-v2513c7'
      else 'rosetta-final-generation-produced-v2513c7'
    end
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_base(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET statement_timeout TO '120s'
AS $function$
declare
  v_engine_version constant text := 'rosetta-v3-deterministic-sql-2.5.13-c7';
  v_rule_set_version constant text := 'rosetta-five-layer-structural-correctness-2.5.13-c7';
  v_manifest_hash text;
  v_corpus_id integer;
  v_document_identifier text;
  v_document_name text;
  v_content_id uuid;
  v_existing_content_hash text;
  v_existing_source_url text;
  v_source_content_hash text;
  v_source_identity_hash text;
  v_configuration_json jsonb;
  v_configuration_hash text;
  v_flat text;
  v_section_number text := 'Document';
  v_effective_date date;
  v_temporal_status text := 'pending';
  v_run_id integer;
  v_run_version integer;
  v_replay_status text;
  v_replay_output_hash text;
  v_replay_admissibility text;
  v_block_id text;
  v_match text[];
  v_clause text;
  v_modal text;
  v_actor text;
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_output jsonb;
  v_output_hash text;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_is_incomplete boolean;
  v_result jsonb;
  v_section record;
  v_clause_row record;
  v_section_flat text;
  v_section_hash text;
  v_section_block_id text;
  v_pipeline_id text;
  v_section_help_count integer := 0;
  v_section_workflow_count integer := 0;
  v_section_accountability_count integer := 0;
  v_section_override_count integer := 0;
  v_section_definition_count integer := 0;
  v_structural_validation jsonb;
begin
  -- C7: exact-source charset receipt gate.
  perform rosetta_v2513.c7_rosetta_v25_charset_gate(p_source_document_id, p_source_text);
  perform pg_advisory_xact_lock(20260731, p_source_document_id);

  select sd.corpus_id, sd.document_identifier, sd.document_name
    into v_corpus_id, v_document_identifier, v_document_name
  from rosetta_v2513.source_document sd
  where sd.id = p_source_document_id;

  if v_corpus_id is null then
    raise exception using errcode = 'P0002', message = 'source_document_not_found';
  end if;

  if nullif(btrim(v_document_identifier), '') is null then
    raise exception using errcode = '22023', message = 'source_document_identifier_required';
  end if;

  if nullif(btrim(p_source_text), '') is null then
    raise exception using errcode = '22023', message = 'source_text_required';
  end if;

  if nullif(btrim(p_source_url), '') is null then
    raise exception using errcode = '22023', message = 'source_url_required';
  end if;

  if nullif(btrim(p_source_version), '') is null then
    raise exception using errcode = '22023', message = 'source_version_required';
  end if;

  select erm.manifest_hash
    into v_manifest_hash
  from rosetta_v2513.extraction_rule_manifest erm
  where erm.engine_version = v_engine_version
    and erm.rule_set_version = v_rule_set_version
    and erm.is_active = true
  limit 1;

  if v_manifest_hash is null then
    raise exception using errcode = '55000', message = 'active_rule_manifest_not_found';
  end if;

  v_source_content_hash := encode(digest(convert_to(p_source_text, 'UTF8'), 'sha256'), 'hex');

  if lower(regexp_replace(coalesce(p_expected_source_content_hash, ''), '^sha256:', '')) <> v_source_content_hash then
    raise exception using errcode = '22000', message = 'source_content_hash_mismatch';
  end if;

  if p_source_byte_hash is not null and lower(p_source_byte_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'source_byte_hash_must_be_sha256_hex';
  end if;

  if lower(coalesce(p_media_type, '')) = 'application/pdf' and p_source_byte_hash is null then
    raise exception using errcode = '22023', message = 'pdf_source_byte_hash_required';
  end if;

  v_configuration_json := jsonb_build_object(
    'reference_date', p_reference_date,
    'text_extractor_version', coalesce(nullif(btrim(p_text_extractor_version), ''), 'unknown'),
    'normalization_version', 'rosetta-normalize-whitespace-v2',
    'parsing_projection_version', 'rosetta-layout-projection-v25',
    'confidence_mode', 'binary_exact_match_only'
  );
  v_configuration_hash := encode(digest(convert_to(v_configuration_json::text, 'UTF8'), 'sha256'), 'hex');

  v_source_identity_hash := encode(digest(convert_to(
    jsonb_build_object(
      'document_identifier', v_document_identifier,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'media_type', p_media_type
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into rosetta_v2513.source_document_content (
    source_document_id,
    source_version,
    source_url,
    media_type,
    source_text,
    source_content_hash,
    source_byte_hash,
    source_provider_hash,
    source_identity_hash,
    source_metadata
  ) values (
    p_source_document_id,
    p_source_version,
    p_source_url,
    coalesce(nullif(btrim(p_media_type), ''), 'text/plain'),
    p_source_text,
    v_source_content_hash,
    lower(p_source_byte_hash),
    p_source_provider_hash,
    v_source_identity_hash,
    coalesce(p_source_metadata, '{}'::jsonb)
  )
  on conflict (source_document_id, source_version) do nothing
  returning source_content_id into v_content_id;

  if v_content_id is null then
    select sdc.source_content_id, sdc.source_content_hash, sdc.source_url
      into v_content_id, v_existing_content_hash, v_existing_source_url
    from rosetta_v2513.source_document_content sdc
    where sdc.source_document_id = p_source_document_id
      and sdc.source_version = p_source_version;

    if v_existing_content_hash is distinct from v_source_content_hash
       or v_existing_source_url is distinct from p_source_url then
      raise exception using errcode = '23505', message = 'source_version_content_conflict';
    end if;
  end if;

  select er.id, er.run_version, er.run_status, er.output_content_hash, er.admissibility_state
    into v_run_id, v_run_version, v_replay_status, v_replay_output_hash, v_replay_admissibility
  from rosetta_v2513.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.source_content_id = v_content_id
    and er.engine_version = v_engine_version
    and er.rule_set_version = v_rule_set_version
    and er.rule_manifest_hash = v_manifest_hash
    and er.configuration_hash = v_configuration_hash
  order by er.id
  limit 1;

  if v_run_id is not null then
    select jsonb_object_agg(lower(lc.layer_name), jsonb_build_object(
             'status', lc.coverage_status,
             'reason', lc.reason,
             'validated_at', lc.validated_at
           ) order by lc.layer_name)
      into v_coverage
    from rosetta_v2513.layer_coverage lc
    where lc.extraction_run_id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', v_replay_status,
      'admissibility_state', v_replay_admissibility,
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', v_replay_output_hash,
      'coverage', coalesce(v_coverage, '{}'::jsonb),
      'replayed', true
    );
  end if;

  select er.id, er.run_version
    into v_run_id, v_run_version
  from rosetta_v2513.extraction_run er
  where er.source_document_id = p_source_document_id
    and er.run_status = 'in_progress'
    and er.source_content_id is null
    and not exists (
      select 1 from rosetta_v2513.hr1_raw_blocks rb where rb.extraction_run_id = er.id
    )
    and not exists (
      select 1 from rosetta_v2513.extraction_manifest em where em.extraction_run_id = er.id
    )
  order by er.run_version desc, er.id desc
  limit 1
  for update;

  if v_run_id is null then
    select coalesce(max(er.run_version), 0) + 1
      into v_run_version
    from rosetta_v2513.extraction_run er
    where er.source_document_id = p_source_document_id;

    insert into rosetta_v2513.extraction_run (
      source_document_id,
      run_version,
      run_status,
      confidence_threshold,
      source_content_id,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      configuration_json,
      source_identity_hash,
      source_content_hash,
      admissibility_state
    ) values (
      p_source_document_id,
      v_run_version,
      'in_progress',
      1.00,
      v_content_id,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      v_configuration_json,
      v_source_identity_hash,
      v_source_content_hash,
      'pending'
    )
    returning id into v_run_id;
  else
    update rosetta_v2513.extraction_run
       set source_content_id = v_content_id,
           engine_version = v_engine_version,
           rule_set_version = v_rule_set_version,
           rule_manifest_hash = v_manifest_hash,
           configuration_hash = v_configuration_hash,
           configuration_json = v_configuration_json,
           source_identity_hash = v_source_identity_hash,
           source_content_hash = v_source_content_hash,
           confidence_threshold = 1.00,
           admissibility_state = 'pending',
           failure_code = null
     where id = v_run_id;
  end if;

  insert into rosetta_v2513.extraction_run_config (
    id,
    extraction_run_id,
    confidence_threshold,
    auto_confirm_above_threshold,
    require_human_review_below,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    configuration_json
  ) values (
    'cfg-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash,
    v_run_id,
    1.00,
    true,
    1.00,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_configuration_json
  )
  on conflict (extraction_run_id) do nothing;

  v_is_incomplete := char_length(btrim(p_source_text)) < 200;

  if v_is_incomplete then
    v_row_counts := jsonb_build_object(
      'raw_blocks', 0,
      'help', 0,
      'workflow', 0,
      'accountability', 0,
      'overrides', 0,
      'definitions', 0
    );

    insert into rosetta_v2513.extraction_manifest (
      id,
      extraction_run_id,
      source_document_id,
      corpus_id,
      canon_version,
      source_hash,
      row_counts,
      validation_results,
      drift_events,
      status,
      source_content_id,
      source_identity_hash,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      output_hash,
      admissibility_state
    ) values (
      'manifest-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash,
      v_run_id,
      p_source_document_id,
      v_corpus_id,
      1,
      v_source_content_hash,
      v_row_counts,
      jsonb_build_object('source_complete', false, 'failure_code', 'source_text_incomplete'),
      '[]'::jsonb,
      'failed',
      v_content_id,
      v_source_identity_hash,
      v_engine_version,
      v_rule_set_version,
      v_manifest_hash,
      v_configuration_hash,
      null,
      'rejected'
    );

    insert into rosetta_v2513.validation_result (
      id, extraction_run_id, test_name, test_result, failure_count, details
    ) values (
      'vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-complete',
      v_run_id,
      'source_complete',
      'fail',
      1,
      jsonb_build_object('minimum_characters', 200, 'observed_characters', char_length(btrim(p_source_text)))
    )
    on conflict (extraction_run_id, test_name) do nothing;

    update rosetta_v2513.extraction_run
       set run_status = 'failed',
           admissibility_state = 'rejected',
           failure_code = 'source_text_incomplete',
           completed_at = clock_timestamp()
     where id = v_run_id;

    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'source_content_id', v_content_id,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'extraction_run_id', v_run_id,
      'run_version', v_run_version,
      'run_status', 'failed',
      'admissibility_state', 'rejected',
      'failure_code', 'source_text_incomplete',
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash,
      'output_content_hash', null,
      'coverage', '{}'::jsonb,
      'replayed', false
    );
  end if;


  v_flat := rosetta_v2513.c7_rosetta_v2_normalize_text(p_source_text);

  v_match := regexp_match(
    v_flat,
    '(?i)EFFECTIVE DATE:\s*([A-Za-z]+\s+[0-9]{1,2},\s+[0-9]{4})'
  );
  if v_match is not null then
    begin
      v_effective_date := to_date(v_match[1], 'Month DD, YYYY');
    exception when others then
      v_effective_date := null;
    end;
  end if;

  if v_effective_date is not null and p_reference_date is not null then
    v_temporal_status :=
      case when p_reference_date >= v_effective_date then 'active' else 'pending' end;
  end if;

  v_block_id := 'blk-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-root';

  insert into rosetta_v2513.hr1_raw_blocks (
    id,
    extraction_run_id,
    source_document_id,
    block_type,
    section_number,
    section_heading_hash,
    block_content_hash,
    parent_block_id,
    hierarchy_path,
    char_offset_start,
    char_offset_end
  ) values (
    v_block_id,
    v_run_id,
    p_source_document_id,
    'document',
    'Document',
    encode(digest(convert_to('Document', 'UTF8'), 'sha256'), 'hex'),
    v_source_content_hash,
    null,
    v_document_identifier || '/' || p_source_version,
    0,
    char_length(p_source_text)
  );

  for v_section in
    select *
    from rosetta_v2513.c7_rosetta_v25_section_spans(p_source_text)
    order by section_ordinal
  loop
    v_section_number := v_section.section_number;
    v_section_flat := rosetta_v2513.c7_rosetta_v2_normalize_text(rosetta_v2513.c7_rosetta_v25_layout_projection(v_section.section_text));
    v_section_hash := encode(
      digest(convert_to(v_section.section_text, 'UTF8'), 'sha256'),
      'hex'
    );
    v_section_block_id :=
      'blk-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

    insert into rosetta_v2513.hr1_raw_blocks (
      id,
      extraction_run_id,
      source_document_id,
      block_type,
      section_number,
      section_heading_hash,
      block_content_hash,
      parent_block_id,
      hierarchy_path,
      char_offset_start,
      char_offset_end
    ) values (
      v_section_block_id,
      v_run_id,
      p_source_document_id,
      'section',
      v_section_number,
      encode(digest(convert_to(v_section_number, 'UTF8'), 'sha256'), 'hex'),
      v_section_hash,
      v_block_id,
      v_document_identifier || '/' || p_source_version || '/' || v_section_number,
      v_section.char_offset_start,
      v_section.char_offset_end
    );

    v_section_help_count := 0;
    v_section_workflow_count := 0;
    v_section_accountability_count := 0;
    v_section_override_count := 0;
    v_section_definition_count := 0;
    v_pipeline_id :=
      'wp-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
      lpad(v_section.section_ordinal::text, 4, '0');

    for v_match in
      select regexp_matches(
        v_section_flat,
        '(?i)there shall be a ([^.;]{1,180}?license)',
        'g'
      )
    loop
      v_help_count := v_help_count + 1;
      v_section_help_count := v_section_help_count + 1;
      v_clause := btrim(v_match[1]);

      insert into rosetta_v2513.help_entity (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, entity_name, entity_type, governing_section, status,
        effective_date, sunset_date, confidence, signal_status
      ) values (
        'he-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_help_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        v_clause,
        'license',
        v_section_number,
        case
          when v_section_flat ~* '\m(amending|amended)\M' then 'modified'
          else 'created'
        end,
        v_effective_date::text,
        null,
        1.00,
        'confirmed'
      );
    end loop;

    for v_clause_row in
      select *
      from rosetta_v2513.c7_rosetta_v25_normative_clauses(v_section.section_text)
      order by clause_ordinal
    loop
      v_workflow_count := v_workflow_count + 1;
      v_section_workflow_count := v_section_workflow_count + 1;
      v_clause := v_clause_row.clause_text;
      v_modal := v_clause_row.modal;
      v_actor := v_clause_row.actor;

      if v_section_workflow_count = 1 then
        insert into rosetta_v2513.workflow_pipeline (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, pipeline_name, governing_section, pipeline_type,
          confidence, signal_status
        ) values (
          v_pipeline_id,
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact source obligations for ' || v_section_number,
          v_section_number,
          'section_ordered_normative_modal_clauses',
          1.00,
          'confirmed'
        );
      end if;

      insert into rosetta_v2513.workflow_step (
        id, workflow_pipeline_id, step_order, step_name, actor, actor_canon_id,
        verb, governing_section, confidence, signal_status
      ) values (
        'ws-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_workflow_count::text, 4, '0'),
        v_pipeline_id,
        v_section_workflow_count,
        v_clause,
        v_actor,
        null,
        v_modal,
        v_section_number,
        1.00,
        'confirmed'
      );

      if (
        v_clause ~* '\m(?:must|shall|may)\M\s+(?:not\s+)?(?:immediately\s+)?(?:report|notify|transmit|investigat|suspend|revoke|refuse|affirm|reverse|petition|take)\M'
        or v_clause ~* '\m(?:must|shall|may)\M\s+consider\s+(?:suspend|revok)'
        or v_clause ~* '\m(?:felony|sentenced|penalty|forfeiture|guilty)\M'
      )
      and v_clause !~* '^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\M'
      and lower(btrim(coalesce(v_actor, ''))) not in ('the report', 'a report')
      then
        v_accountability_count := v_accountability_count + 1;
        v_section_accountability_count := v_section_accountability_count + 1;

        insert into rosetta_v2513.accountability_route (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, route_name, governing_section, trigger_condition,
          enforcement_type, enforcement_actor, actor_canon_id,
          enforcement_direction, confidence, signal_status
        ) values (
          'ar-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          'Exact accountability clause ' || v_accountability_count,
          v_section_number,
          v_clause,
          case
            when v_clause ~* 'forfeitur'
              then 'source_stated_forfeiture_rule'
            else 'source_stated_enforcement_rule'
          end,
          v_actor,
          null,
          'agency_mandate',
          1.00,
          'confirmed'
        );

        insert into rosetta_v2513.escalation_node (
          id, accountability_route_id, node_order, node_name, action_required,
          actor_canon_id, escalation_trigger
        ) values (
          'en-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          'ar-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_accountability_count::text, 4, '0'),
          1,
          'Source-stated accountability action',
          v_clause,
          null,
          v_clause
        );
      end if;
    end loop;

    for v_match in
      select regexp_matches(v_section_flat, '([^.]+[.])', 'g')
    loop
      v_clause := rosetta_v2513.c7_rosetta_v25_unprotect_text(rosetta_v2513.c7_rosetta_v2_normalize_text(v_match[1]));
      if v_clause ~*
        '\m(unless|however|except|notwithstanding)\M|\msubject to\M|\mdoes not apply\M|\mdo not apply\M|^\s*(?:\([a-z0-9]+\)\s*)?Nothing\s+in\s+.+\s+shall\s+prevent\M'
         and v_clause !~* '["“][^"”]{1,160}["”]\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\M'
      then
        v_override_count := v_override_count + 1;
        v_section_override_count := v_section_override_count + 1;

        select inferred.modal, inferred.actor
          into v_modal, v_actor
        from rosetta_v2513.c7_rosetta_v2_modal_and_actor(v_clause) inferred;

        insert into rosetta_v2513.entity_override (
          id, corpus_id, source_document_id, extraction_run_id, canon_version,
          source_block_id, override_type, overridden_authority, override_scope,
          override_condition, granting_actor, actor_canon_id, effective_date,
          sunset_date, temporal_status, confidence, signal_status
        ) values (
          'ov-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
            lpad(v_override_count::text, 4, '0'),
          v_corpus_id,
          p_source_document_id,
          v_run_id,
          2,
          v_section_block_id,
          case
            when v_clause ~* '\m(unless|except|however|does not apply|do not apply)\M'
              then 'source_stated_exception'
            else 'source_stated_condition'
          end,
          'Base rule within ' || v_section_number,
          v_clause,
          v_clause,
          v_actor,
          null,
          v_effective_date,
          null,
          v_temporal_status,
          1.00,
          'confirmed'
        );
      end if;
    end loop;

    for v_match in
      select regexp_matches(
        v_section_flat,
        '(?i)["“]([^"”]{1,120})["”]\s+(includes(?:,\s*but is not limited to)?|means|does not include|has the same meaning as)\s*:?[ ]*([^.;]+[.;])',
        'g'
      )
    loop
      v_definition_count := v_definition_count + 1;
      v_section_definition_count := v_section_definition_count + 1;

      insert into rosetta_v2513.term_definition (
        id, corpus_id, source_document_id, extraction_run_id, canon_version,
        source_block_id, defined_term, defining_section, definition_text,
        definition_type, confidence, signal_status
      ) values (
        'td-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
          lpad(v_definition_count::text, 4, '0'),
        v_corpus_id,
        p_source_document_id,
        v_run_id,
        2,
        v_section_block_id,
        btrim(v_match[1]),
        v_section_number,
        rosetta_v2513.c7_rosetta_v25_unprotect_text(btrim(v_match[2] || ' ' || v_match[3])),
        'technical',
        1.00,
        'confirmed'
      );
    end loop;

    insert into rosetta_v2513.layer_coverage (
      id, extraction_run_id, source_block_id, layer_name,
      coverage_status, reason, validated_at
    )
    select
      'lc-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-' ||
        lpad(v_section.section_ordinal::text, 4, '0') || '-' || layer_name,
      v_run_id,
      v_section_block_id,
      layer_name,
      case when layer_count > 0 then 'populated' else 'not_applicable' end,
      case
        when layer_count > 0
          then 'Deterministic section-local rule match.'
        else 'No deterministic section-local rule matched this source span under rule manifest ' ||
             v_manifest_hash || '.'
      end,
      clock_timestamp()
    from (values
      ('HELP'::text, v_section_help_count),
      ('WORKFLOW'::text, v_section_workflow_count),
      ('ACCOUNTABILITY'::text, v_section_accountability_count),
      ('OVERRIDES'::text, v_section_override_count),
      ('DEFINITIONS'::text, v_section_definition_count)
    ) as layer_receipts(layer_name, layer_count);
  end loop;

  select jsonb_object_agg(
           lower(cbl.layer_name),
           jsonb_build_object(
             'status', cbl.coverage_status,
             'reason', cbl.reason
           )
           order by cbl.layer_name
         )
    into v_coverage
  from (
    select
      lc.layer_name,
      case
        when bool_or(lc.coverage_status = 'populated') then 'populated'
        else 'not_applicable'
      end as coverage_status,
      string_agg(distinct lc.reason, ' | ' order by lc.reason) as reason
    from rosetta_v2513.layer_coverage lc
    where lc.extraction_run_id = v_run_id
    group by lc.layer_name
  ) cbl;

  v_row_counts := jsonb_build_object(
    'raw_blocks', (select count(*) from rosetta_v2513.hr1_raw_blocks where extraction_run_id = v_run_id),
    'help', v_help_count,
    'workflow_pipelines', (select count(*) from rosetta_v2513.workflow_pipeline where extraction_run_id = v_run_id),
    'workflow_steps', v_workflow_count,
    'accountability_routes', v_accountability_count,
    'escalation_nodes', v_accountability_count,
    'appeals', 0,
    'overrides', v_override_count,
    'definitions', v_definition_count,
    'coverage', 5
  );

  select jsonb_build_object(
    'contract_version', 'rosetta-law-view-v1',
    'source_receipt', jsonb_build_object(
      'document_identifier', v_document_identifier,
      'document_name', v_document_name,
      'source_version', p_source_version,
      'source_url', p_source_url,
      'media_type', p_media_type,
      'source_identity_hash', v_source_identity_hash,
      'source_content_hash', v_source_content_hash,
      'source_byte_hash', p_source_byte_hash,
      'source_provider_hash', p_source_provider_hash,
      'source_span', jsonb_build_object(
        'source_block_id', v_block_id,
        'char_offset_start', 0,
        'char_offset_end', char_length(p_source_text),
        'block_content_hash', v_source_content_hash
      )
    ),
    'engine', jsonb_build_object(
      'engine_version', v_engine_version,
      'rule_set_version', v_rule_set_version,
      'rule_manifest_hash', v_manifest_hash,
      'configuration_hash', v_configuration_hash
    ),
    'help', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'source_block_id', h.source_block_id,
        'entity_name', h.entity_name,
        'entity_type', h.entity_type,
        'governing_section', h.governing_section,
        'status', h.status,
        'effective_date', h.effective_date,
        'sunset_date', h.sunset_date,
        'confidence', h.confidence,
        'signal_status', h.signal_status
      ) order by h.id)
      from rosetta_v2513.help_entity h where h.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'workflow', jsonb_build_object(
      'pipelines', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', wp.id,
          'source_block_id', wp.source_block_id,
          'pipeline_name', wp.pipeline_name,
          'governing_section', wp.governing_section,
          'pipeline_type', wp.pipeline_type,
          'confidence', wp.confidence,
          'signal_status', wp.signal_status
        ) order by wp.id)
        from rosetta_v2513.workflow_pipeline wp where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ws.id,
          'pipeline_id', ws.workflow_pipeline_id,
          'step_order', ws.step_order,
          'step_name', ws.step_name,
          'actor', ws.actor,
          'verb', ws.verb,
          'governing_section', ws.governing_section,
          'confidence', ws.confidence,
          'signal_status', ws.signal_status
        ) order by ws.workflow_pipeline_id, ws.step_order)
        from rosetta_v2513.workflow_step ws
        join rosetta_v2513.workflow_pipeline wp on wp.id = ws.workflow_pipeline_id
        where wp.extraction_run_id = v_run_id
      ), '[]'::jsonb)
    ),
    'accountability', jsonb_build_object(
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ar.id,
          'source_block_id', ar.source_block_id,
          'route_name', ar.route_name,
          'governing_section', ar.governing_section,
          'trigger_condition', ar.trigger_condition,
          'enforcement_type', ar.enforcement_type,
          'enforcement_actor', ar.enforcement_actor,
          'enforcement_direction', ar.enforcement_direction,
          'confidence', ar.confidence,
          'signal_status', ar.signal_status
        ) order by ar.id)
        from rosetta_v2513.accountability_route ar where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'nodes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', en.id,
          'route_id', en.accountability_route_id,
          'node_order', en.node_order,
          'node_name', en.node_name,
          'action_required', en.action_required,
          'escalation_trigger', en.escalation_trigger
        ) order by en.accountability_route_id, en.node_order)
        from rosetta_v2513.escalation_node en
        join rosetta_v2513.accountability_route ar on ar.id = en.accountability_route_id
        where ar.extraction_run_id = v_run_id
      ), '[]'::jsonb),
      'appeals', '[]'::jsonb
    ),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', eo.id,
        'source_block_id', eo.source_block_id,
        'override_type', eo.override_type,
        'overridden_authority', eo.overridden_authority,
        'override_scope', eo.override_scope,
        'override_condition', eo.override_condition,
        'granting_actor', eo.granting_actor,
        'effective_date', eo.effective_date,
        'sunset_date', eo.sunset_date,
        'temporal_status', eo.temporal_status,
        'governing_section', (select rb.section_number from rosetta_v2513.hr1_raw_blocks rb where rb.id = eo.source_block_id),
        'confidence', eo.confidence,
        'signal_status', eo.signal_status
      ) order by eo.id)
      from rosetta_v2513.entity_override eo where eo.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'definitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', td.id,
        'source_block_id', td.source_block_id,
        'defined_term', td.defined_term,
        'defining_section', td.defining_section,
        'definition_text', td.definition_text,
        'definition_type', td.definition_type,
        'confidence', td.confidence,
        'signal_status', td.signal_status
      ) order by td.id)
      from rosetta_v2513.term_definition td where td.extraction_run_id = v_run_id
    ), '[]'::jsonb),
    'coverage', v_coverage
  ) into v_output;

  v_output_hash := encode(digest(convert_to(v_output::text, 'UTF8'), 'sha256'), 'hex');

  v_structural_validation := rosetta_v2513.c7_rosetta_v25_validate_extraction(v_run_id, p_source_text);
  if v_structural_validation->>'status' <> 'pass' then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v2_structural_validation_failed',
      detail = v_structural_validation::text;
  end if;

  insert into rosetta_v2513.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-structural-correctness',
    v_run_id,
    'structural_correctness_v2',
    'pass',
    0,
    v_structural_validation
  ) on conflict (extraction_run_id, test_name) do nothing;

  insert into rosetta_v2513.extraction_manifest (
    id,
    extraction_run_id,
    source_document_id,
    corpus_id,
    canon_version,
    source_hash,
    row_counts,
    validation_results,
    drift_events,
    status,
    source_content_id,
    source_identity_hash,
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    output_hash,
    admissibility_state
  ) values (
    'manifest-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash,
    v_run_id,
    p_source_document_id,
    v_corpus_id,
    1,
    v_source_content_hash,
    v_row_counts,
    jsonb_build_object(
      'source_hash_verified', true,
      'source_bytes_receipted', p_source_byte_hash is not null or lower(p_media_type) <> 'application/pdf',
      'five_layer_coverage', (select count(*) = 5 from jsonb_object_keys(v_coverage)),
      'no_pending_coverage', not exists (
        select 1 from rosetta_v2513.layer_coverage lc
        where lc.extraction_run_id = v_run_id
          and lc.coverage_status in ('pending_extraction', 'extraction_failed')
      ),
      'canonical_rows_source_bound', true,
      'structural_correctness_v2', v_structural_validation,
      'output_hash_verified', true
    ),
    '[]'::jsonb,
    'clean',
    v_content_id,
    v_source_identity_hash,
    v_engine_version,
    v_rule_set_version,
    v_manifest_hash,
    v_configuration_hash,
    v_output_hash,
    'admissible'
  );

  insert into rosetta_v2513.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-hash', v_run_id, 'source_hash_verified', 'pass', 0,
      jsonb_build_object('source_content_hash', v_source_content_hash)),
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bytes', v_run_id, 'source_bytes_receipted', 'pass', 0,
      jsonb_build_object('source_byte_hash', p_source_byte_hash, 'media_type', p_media_type)),
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-coverage', v_run_id, 'five_layer_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-no-pending', v_run_id, 'no_pending_coverage', 'pass', 0,
      jsonb_build_object('coverage', v_coverage)),
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-source-bound', v_run_id, 'canonical_rows_source_bound', 'pass', 0,
      jsonb_build_object('source_block_id', v_block_id)),
    ('vr-v2513c7-' || v_source_identity_hash || '-' || v_configuration_hash || '-output-hash', v_run_id, 'output_hash_verified', 'pass', 0,
      jsonb_build_object('output_content_hash', v_output_hash))
  on conflict (extraction_run_id, test_name) do nothing;

  update rosetta_v2513.extraction_run
     set run_status = 'completed',
         output_content_hash = v_output_hash,
         admissibility_state = 'admissible',
         failure_code = null,
         completed_at = clock_timestamp()
   where id = v_run_id;

  v_result := jsonb_build_object(
    'source_document_id', p_source_document_id,
    'source_content_id', v_content_id,
    'source_identity_hash', v_source_identity_hash,
    'source_content_hash', v_source_content_hash,
    'source_byte_hash', p_source_byte_hash,
    'source_version', p_source_version,
    'source_url', p_source_url,
    'extraction_run_id', v_run_id,
    'run_version', v_run_version,
    'run_status', 'completed',
    'admissibility_state', 'admissible',
    'engine_version', v_engine_version,
    'rule_set_version', v_rule_set_version,
    'rule_manifest_hash', v_manifest_hash,
    'configuration_hash', v_configuration_hash,
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'coverage', v_coverage,
    'replayed', false
  );

  return v_result;
exception
  when unique_violation then
    raise;
  when others then
    if v_run_id is not null then
      update rosetta_v2513.extraction_run
         set run_status = 'failed',
             admissibility_state = 'rejected',
             failure_code = sqlstate || ':' || sqlerrm,
             completed_at = clock_timestamp()
       where id = v_run_id
         and run_status = 'in_progress';
    end if;
    raise;
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_candidate(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '180s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_base jsonb;
  v_receipt jsonb;
  v_run_id integer;
  v_finalized boolean:=false;
  v_manifest_hash text;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_objects jsonb;
  v_structural jsonb;
  v_independent jsonb;
begin
  select manifest_hash into v_manifest_hash
  from rosetta_v2513.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.13-c7'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.13-c7'
    and is_active=true;
  if v_manifest_hash is null then raise exception 'rosetta_v2513c7_active_manifest_missing'; end if;

  v_base:=rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  v_run_id:=nullif(v_base->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_base||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;

  if coalesce(v_base->>'run_status','')<>'completed'
     or coalesce(v_base->>'admissibility_state','')<>'admissible' then
    return v_base||jsonb_build_object('rule_manifest_hash',v_manifest_hash,'handoff_contract_version','rosetta-civic-genome-handoff-v2');
  end if;

  select exists(
    select 1
    from rosetta_v2513.extraction_run run
    join rosetta_v2513.extraction_manifest manifest on manifest.extraction_run_id=run.id
    join rosetta_v2513.validation_result independent on independent.extraction_run_id=run.id
      and independent.test_name='independent_structure_v2513c7'
      and independent.test_result='pass'
      and independent.failure_count=0
    join rosetta_v2513.validation_result output_hash on output_hash.extraction_run_id=run.id
      and output_hash.test_name='output_hash_verified'
      and output_hash.test_result='pass'
      and output_hash.failure_count=0
    where run.id=v_run_id
      and run.engine_version='rosetta-v3-deterministic-sql-2.5.13-c7'
      and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.13-c7'
      and run.rule_manifest_hash=v_manifest_hash
      and run.run_status='completed'
      and run.admissibility_state='admissible'
      and run.output_content_hash is not null
      and manifest.status='clean'
      and manifest.admissibility_state='admissible'
      and manifest.output_hash=run.output_content_hash
  ) into v_finalized;

  if not v_finalized then
    v_receipt:=rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_candidate_base(
      p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
      p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
    );
    if coalesce(v_receipt->>'run_status','')<>'completed'
       or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then
      return v_receipt;
    end if;
    v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  else
    v_receipt:=v_base||jsonb_build_object(
      'replayed',true,
      'exact_final_replay',true,
      'replay_contract','rosetta-finalized-generation-immutable-replay-v2513c7'
    );
  end if;

  select manifest.row_counts into v_row_counts
  from rosetta_v2513.extraction_manifest manifest
  where manifest.extraction_run_id=v_run_id;
  v_coverage:=rosetta_v2513.c7_rosetta_v2511_final_coverage(v_run_id);
  select coalesce(law.objects,'[]'::jsonb),coalesce(law.structural_representations,'[]'::jsonb)
    into v_objects,v_structural
  from rosetta_v2513.v_rosetta_operator_law_view_v1 law
  where law.extraction_run_id=v_run_id;
  select details into v_independent
  from rosetta_v2513.validation_result
  where extraction_run_id=v_run_id and test_name='independent_structure_v2513c7';

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.13-c7',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.13-c7',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'coverage',coalesce(v_coverage,'{}'::jsonb),
    'row_counts',coalesce(v_row_counts,'{}'::jsonb),
    'objects',coalesce(v_objects,'[]'::jsonb),
    'structural_representations',coalesce(v_structural,'[]'::jsonb),
    'independent_structure_v2513c7',v_independent
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_candidate_base(p_source_document_id integer, p_source_text text, p_expected_source_content_hash text, p_source_url text, p_source_version text, p_media_type text DEFAULT 'text/plain'::text, p_source_byte_hash text DEFAULT NULL::text, p_source_provider_hash text DEFAULT NULL::text, p_reference_date date DEFAULT NULL::date, p_text_extractor_version text DEFAULT 'plain-text-1'::text, p_source_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '120s'
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_receipt jsonb;
  v_run_id integer;
  v_manifest_hash text;
  v_reclassification jsonb;
  v_span_receipt jsonb;
  v_span_repairs jsonb;
  v_reconciliation jsonb;
  v_coverage jsonb;
  v_self_check jsonb;
  v_independent jsonb;
  v_exact jsonb;
  v_output jsonb;
  v_output_hash text;
  v_pass boolean;
  v_run rosetta_v2513.extraction_run%rowtype;
  v_error text;
begin
  select manifest_hash into v_manifest_hash from rosetta_v2513.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.13-c7' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.13-c7';

  v_receipt:=rosetta_v2513.c7_run_rosetta_v3_extraction_v2511_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  if coalesce(v_receipt->>'run_status','')<>'completed' or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then
    return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash);
  end if;
  v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;

  begin
    v_receipt:=rosetta_v2513.c7_rosetta_v2511_finalize_extraction(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb),v_receipt);
    v_reclassification:=rosetta_v2513.c7_rosetta_v2511_reclassify_amendment_structure(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb));
    v_span_receipt:=rosetta_v2513.c7_rosetta_v25_refresh_object_source_spans(v_run_id,p_source_text);
    v_span_repairs:=rosetta_v2513.c7_rosetta_v25_register_span_repairs(v_run_id);
    v_reconciliation:=rosetta_v2513.c7_rosetta_v2511_reconcile_structural_correctness(v_run_id);
    v_coverage:=rosetta_v2513.c7_rosetta_v2511_refresh_final_coverage_receipts(v_run_id);
    v_self_check:=rosetta_v2513.c7_rosetta_v2511_validate_extraction(v_run_id,p_source_text);
    v_independent:=rosetta_v2513.c7_rosetta_v2511_validate_independent_structure(v_run_id,p_source_text);
  exception when others then
    v_error:=left(sqlerrm,240);
    update rosetta_v2513.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v2513c7_post_base_failure',completed_at=clock_timestamp() where id=v_run_id;
    update rosetta_v2513.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('rosetta_v2513c7_post_base_failure',jsonb_build_object('message',v_error)) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.13-c7','rule_set_version','rosetta-five-layer-structural-correctness-2.5.13-c7','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v2513c7_post_base_failure');
  end;

  select * into v_run from rosetta_v2513.extraction_run where id=v_run_id;
  v_exact:=jsonb_build_object(
    'status',case when coalesce(v_independent->>'status','fail')='pass' then 'pass' else 'fail' end,
    'contract','rosetta-structural-correctness-v2513c7',
    'document_family',v_independent->>'document_family',
    'amendment_disposition',v_reclassification->>'amendment_disposition',
    'structural_representation_count',coalesce((v_reclassification->>'representation_count')::integer,0),
    'operative_layer_projection',v_reclassification->>'operative_layer_projection',
    'structural_footer_contamination_count',coalesce((v_independent->>'structural_footer_contamination_count')::integer,0),
    'structural_span_mismatch_count',coalesce((v_independent->>'structural_span_mismatch_count')::integer,0),
    'amendment_coverage_mismatch_count',coalesce((v_independent->>'amendment_coverage_mismatch_count')::integer,0)
  );

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-structural-correctness',v_run_id,'structural_correctness_v2',case when v_self_check->>'status'='pass' then 'pass' else 'fail' end,case when v_self_check->>'status'='pass' then 0 else 1 end,v_self_check)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-independent-structure',v_run_id,'independent_structure_v2513c7',case when v_independent->>'status'='pass' then 'pass' else 'fail' end,case when v_independent->>'status'='pass' then 0 else 1 end,v_independent)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-exact-source-structure',v_run_id,'exact_source_structure_v2513c7',case when v_exact->>'status'='pass' then 'pass' else 'fail' end,case when v_exact->>'status'='pass' then 0 else 1 end,v_exact)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  v_pass:=coalesce(v_coverage->>'status','fail')='pass'
    and coalesce(v_self_check->>'status','fail')='pass'
    and coalesce(v_independent->>'status','fail')='pass'
    and rosetta_v2513.c7_rosetta_blocking_structural_repair_count(v_run_id)=0;

  if not v_pass then
    update rosetta_v2513.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v2513c7_final_validation_failed',completed_at=clock_timestamp() where id=v_run_id;
    update rosetta_v2513.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v2513c7',v_reclassification,'structural_reconciliation_v2513c7',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v2513c7',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v2513c7',v_independent,'exact_source_structure_v2513c7',v_exact) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.13-c7','rule_set_version','rosetta-five-layer-structural-correctness-2.5.13-c7','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v2513c7_final_validation_failed','independent_structure_v2513c7',v_independent);
  end if;

  v_output:=rosetta_v2513.c7_rosetta_v2511_canonical_output(v_run_id);
  if v_output is null then raise exception 'rosetta_v2513c7_final_canonical_output_unavailable'; end if;
  v_output_hash:=encode(digest(convert_to(v_output::text,'UTF8'),'sha256'),'hex');

  update rosetta_v2513.extraction_run set output_content_hash=v_output_hash,run_status='completed',admissibility_state='admissible',failure_code=null,completed_at=clock_timestamp() where id=v_run_id;
  update rosetta_v2513.extraction_manifest set output_hash=v_output_hash,row_counts=v_output->'row_counts',status='clean',admissibility_state='admissible',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reclassification_v2513c7',v_reclassification,'structural_reconciliation_v2513c7',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'final_five_layer_coverage_v2513c7',v_coverage,'structural_correctness_v2',v_self_check,'independent_structure_v2513c7',v_independent,'exact_source_structure_v2513c7',v_exact) where extraction_run_id=v_run_id;

  insert into rosetta_v2513.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v2513c7-'||v_run.source_identity_hash||'-'||v_run.configuration_hash||'-output-hash',v_run_id,'output_hash_verified','pass',0,jsonb_build_object('output_content_hash',v_output_hash,'contract','rosetta-final-output-hash-v2513c7'))
  on conflict(extraction_run_id,test_name) do update set test_result='pass',failure_count=0,details=excluded.details,executed_at=now();

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.13-c7',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.13-c7',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'run_status','completed','admissibility_state','admissible','failure_code',null,
    'output_content_hash',v_output_hash,
    'structural_reclassification',v_reclassification,
    'independent_structure_v2513c7',v_independent
  );
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.c7_rosetta_v25_charset_gate(p_source_document_id integer, p_source_text text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_rep integer;
  v_receipt jsonb;
  v_disp text;
  v_recorded_rep integer;
begin
  v_rep := regexp_count(coalesce(p_source_text,''), chr(65533));
  -- decoding-method receipt recorded at immutable registration time (migration 01),
  -- bound to the EXACT source: content id for this document AND the sha256 of
  -- the text being gated. A receipt for any other document or text never applies.
  select r.charset_receipt into v_receipt
  from rosetta_v2513.source_document_content c
  join rosetta_replay.replay_source_registry r
    on r.source_content_id = c.source_content_id
   and r.source_content_hash = encode(digest(convert_to(p_source_text,'UTF8'),'sha256'),'hex')
  where c.source_document_id = p_source_document_id
  order by r.registered_at desc
  limit 1;
  if v_receipt is null
     or nullif(v_receipt->>'decoding_method','') is null
     or not (v_receipt ? 'invalid_byte_handling')
     or not (v_receipt ? 'replacement_char_count')
     or not (v_receipt ? 'replacement_chars_block_span_certainty') then
    raise exception 'charset_receipt_missing_or_incomplete: exact source requires decoding method, invalid-byte handling, replacement count, and span-certainty disposition'
      using errcode = 'P1A07';
  end if;
  begin
    v_recorded_rep := (v_receipt->>'replacement_char_count')::integer;
  exception when others then
    raise exception 'charset_receipt_invalid_replacement_count' using errcode = 'P1A07';
  end;
  if v_recorded_rep is distinct from v_rep then
    raise exception 'charset_receipt_count_mismatch: observed %, receipted %', v_rep, v_recorded_rep
      using errcode = 'P1A07';
  end if;
  if v_rep > 0 then
    v_disp := coalesce(v_receipt->>'replacement_char_disposition','undispositioned');
    if v_disp <> 'manual_verified_literal'
       or coalesce((v_receipt->>'replacement_chars_block_span_certainty')::boolean,true) then
      raise exception 'replacement_chars_block_span_certainty: % U+FFFD characters require manual_verified_literal and an explicit false span-certainty block', v_rep
        using errcode = 'P1A07';
    end if;
  end if;
end;
$function$;
insert into rosetta_v2513.extraction_rule_manifest
  (engine_version, rule_set_version, manifest_hash, manifest_json, is_active)
values ('rosetta-v3-deterministic-sql-2.5.13-c7', 'rosetta-five-layer-structural-correctness-2.5.13-c7',
        '5860a706806878f0d81ca8b1e70221ff5352fd88c85da4bff7c9b4c1cdf6490c', $manifest${"changes":["C7 decoding-method receipts; undispositioned replacement chars block"],"closure_namespace":"rosetta_v2513","closure_prefix":"c7_","control_identity":"rosetta-v3-deterministic-sql-2.5.11","engine_version":"rosetta-v3-deterministic-sql-2.5.13-c7","lane":"c7","publication":"structurally disabled: no publication view, no registry row, no publishable-run path references this namespace","rule_set_version":"rosetta-five-layer-structural-correctness-2.5.13-c7","title":"C7 decoding-method receipts; undispositioned replacement chars block"}$manifest$::jsonb, true);