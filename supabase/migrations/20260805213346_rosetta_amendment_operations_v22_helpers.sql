begin

create extension if not exists pgcrypto

create or replace function public.rosetta_v22_exact_definition_text(
  p_source_text text,
  p_definition_text text
)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_source text := public.rosetta_v2_normalize_text(p_source_text);
  v_definition text := public.rosetta_v2_normalize_text(p_definition_text);
  v_candidate text;
  v_position integer;
  v_operator text;
begin
  v_position := strpos(lower(v_source), lower(v_definition));
  if v_position > 0 then
    return substr(v_source, v_position, char_length(v_definition));
  end if;

  foreach v_operator in array array[
    'does not include',
    'has the same meaning as',
    'includes, but is not limited to',
    'includes',
    'means'
  ]
  loop
    if lower(v_definition) like v_operator || ' %' then
      v_candidate := substr(v_definition, 1, char_length(v_operator))
        || ': '
        || substr(v_definition, char_length(v_operator) + 2);
      v_position := strpos(lower(v_source), lower(v_candidate));
      if v_position > 0 then
        return substr(v_source, v_position, char_length(v_candidate));
      end if;
    end if;
  end loop;

  return v_definition;
end;
$$

create or replace function public.rosetta_v22_amendment_operations(
  p_source_text text
)
returns table (
  operation_ordinal integer,
  operation_text text,
  target_locator text,
  operation_kind text,
  char_offset_start integer,
  char_offset_end integer
)
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_source text := public.rosetta_v2_normalize_text(p_source_text);
  v_match text[];
  v_operation text;
  v_action_position integer;
  v_start integer;
  v_ordinal integer := 0;
begin
  for v_match in
    select regexp_matches(
      v_source,
      '(?i)(On page .*?)(?= On page | EFFECT:| --- END ---|$)',
      'g'
    )
  loop
    v_operation := public.rosetta_v2_normalize_text(v_match[1]);
    v_start := strpos(p_source_text, v_operation);
    if v_start = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v22_amendment_operation_offset_unresolved',
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
        message = 'rosetta_v22_amendment_operation_verb_missing',
        detail = left(v_operation, 500);
    end if;

    v_ordinal := v_ordinal + 1;
    return query
    select
      v_ordinal,
      v_operation,
      nullif(btrim(substr(v_operation, 1, v_action_position - 1)), ''),
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
$$

create or replace function public.rosetta_v22_canonical_output(
  p_extraction_run_id integer
)
returns jsonb
language sql
stable
strict
set search_path = pg_catalog, public
as $$
  with law as (
    select *
    from public.v_civic_genome_law_view_v1
    where extraction_run_id = p_extraction_run_id
  ),
  counts as (
    select jsonb_build_object(
      'raw_blocks', (select count(*) from public.hr1_raw_blocks where extraction_run_id = p_extraction_run_id),
      'help', (select count(*) from public.help_entity where extraction_run_id = p_extraction_run_id),
      'workflow_pipelines', (select count(*) from public.workflow_pipeline where extraction_run_id = p_extraction_run_id),
      'workflow_steps', (
        select count(*) from public.workflow_step step
        join public.workflow_pipeline pipeline on pipeline.id = step.workflow_pipeline_id
        where pipeline.extraction_run_id = p_extraction_run_id
      ),
      'accountability_routes', (select count(*) from public.accountability_route where extraction_run_id = p_extraction_run_id),
      'overrides', (select count(*) from public.entity_override where extraction_run_id = p_extraction_run_id),
      'definitions', (select count(*) from public.term_definition where extraction_run_id = p_extraction_run_id),
      'coverage', (select count(*) from public.layer_coverage where extraction_run_id = p_extraction_run_id)
    ) as value
  )
  select jsonb_build_object(
    'contract', 'rosetta-canonical-law-view-v22',
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
$$

create or replace function public.rosetta_v22_finalize_extraction(
  p_extraction_run_id integer,
  p_source_text text,
  p_source_metadata jsonb,
  p_base_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  if v_run.engine_version <> 'rosetta-v3-deterministic-sql-2.2.0'
     or v_run.rule_set_version <> 'rosetta-five-layer-structural-correctness-2.2.0' then
    raise exception 'rosetta_v22_engine_identity_mismatch';
  end if;

  select sd.corpus_id, sd.document_identifier
    into v_document
  from public.source_document sd
  where sd.id = v_run.source_document_id;

  update public.term_definition definition
     set definition_text = public.rosetta_v22_exact_definition_text(
       p_source_text,
       definition.definition_text
     )
   where definition.extraction_run_id = p_extraction_run_id
     and definition.definition_text is distinct from
       public.rosetta_v22_exact_definition_text(
         p_source_text,
         definition.definition_text
       );
  get diagnostics v_definition_change_count = row_count;

  select count(*)::integer
    into v_definition_mismatch_count
  from public.term_definition definition
  where definition.extraction_run_id = p_extraction_run_id
    and strpos(
      lower(public.rosetta_v2_normalize_text(p_source_text)),
      lower(public.rosetta_v2_normalize_text(definition.definition_text))
    ) = 0;
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
      from public.rosetta_v22_amendment_operations(p_source_text)
      order by operation_ordinal
    loop
      v_operation_count := v_operation_count + 1;
      v_section_number := 'Amendment Operation ' || v_operation.operation_ordinal;
      v_block_id := 'blk-v22-' || v_run.source_identity_hash || '-amend-' ||
        lpad(v_operation.operation_ordinal::text, 4, '0');
      v_override_id := 'ov-v22-' || v_run.source_identity_hash || '-amend-' ||
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
        'pending',
        1.00,
        'confirmed'
      ) on conflict (id) do nothing;

      insert into public.layer_coverage (
        id, extraction_run_id, source_block_id, layer_name,
        coverage_status, reason, validated_at
      )
      select
        'lc-v22-' || v_run.source_identity_hash || '-amend-' ||
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

    if v_operation_count = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v22_amendment_operation_not_found';
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
        or operation.override_scope !~* '^On page '
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

  v_output := public.rosetta_v22_canonical_output(p_extraction_run_id);
  if v_output is null then
    raise exception 'rosetta_v22_canonical_output_unavailable';
  end if;
  v_output_hash := encode(
    digest(convert_to(v_output::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_row_counts := v_output -> 'row_counts';
  v_validation := jsonb_build_object(
    'status', 'pass',
    'contract', 'rosetta-structural-correctness-v22',
    'definition_exact_text_change_count', v_definition_change_count,
    'definition_exact_text_mismatch_count', v_definition_mismatch_count,
    'amendment_operation_count', v_operation_count,
    'amendment_operation_mismatch_count', v_operation_mismatch_count,
    'document_family', nullif(v_document_family, '')
  );

  insert into public.validation_result (
    id, extraction_run_id, test_name, test_result, failure_count, details
  ) values (
    'vr-v22-' || v_run.source_identity_hash || '-exact-source-structure',
    p_extraction_run_id,
    'exact_source_structure_v22',
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
           || jsonb_build_object('exact_source_structure_v22', v_validation),
         output_hash = v_output_hash,
         status = 'completed',
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
    'engine_version', 'rosetta-v3-deterministic-sql-2.2.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.2.0',
    'output_content_hash', v_output_hash,
    'row_counts', v_row_counts,
    'exact_source_structure_v22', v_validation,
    'replayed', false
  );
end;
$$

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-2.2.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.2.0',
    'inherits', jsonb_build_object(
      'engine_version', 'rosetta-v3-deterministic-sql-2.1.0',
      'rule_set_version', 'rosetta-five-layer-structural-correctness-2.1.0'
    ),
    'definition_text', jsonb_build_object(
      'rule', 'Definition text must occur exactly in the normalized immutable source snapshot, including operator punctuation.',
      'punctuation_repair', 'Only a source-observed colon immediately following the declared definition operator may be restored.'
    ),
    'amendment_operations', jsonb_build_object(
      'source_rule', 'Each operation begins with On page and terminates before the next On page, EFFECT, END, or source end.',
      'operation_markers', jsonb_build_array('strike', 'insert', 'delete', 'renumber'),
      'object_layer', 'OVERRIDES',
      'override_type', 'source_stated_amendment_operation',
      'legal_effect', 'not inferred or applied',
      'base_binding', 'owned by Docket and Civic Genome version spine'
    ),
    'output_hash', jsonb_build_object(
      'contract', 'rosetta-canonical-law-view-v22',
      'scope', 'versioned receipts, source identity, normalized objects, terminal coverage, provenance state, and row counts'
    ),
    'validation', jsonb_build_array(
      'all definition text occurs exactly in source',
      'every registered amendment has at least one exact source-stated operation',
      'every amendment operation has source offsets, target locator, and operation kind',
      'all five terminal layer receipts exist for amendment-operation blocks'
    ),
    'provenance', 'No amendment instruction is executed. Rosetta preserves the exact source operation as inspectable structural evidence.'
  ) as manifest_json
), canonical_receipt as (
  select
    manifest_json,
    encode(digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'), 'hex')
      as manifest_hash
  from canonical_manifest
)
insert into public.extraction_rule_manifest (
  engine_version, rule_set_version, manifest_hash, manifest_json, is_active
)
select
  'rosetta-v3-deterministic-sql-2.2.0',
  'rosetta-five-layer-structural-correctness-2.2.0',
  manifest_hash,
  manifest_json,
  true
from canonical_receipt
on conflict (engine_version, rule_set_version) do update
set manifest_hash = excluded.manifest_hash,
    manifest_json = excluded.manifest_json,
    is_active = true

revoke all on function public.rosetta_v22_exact_definition_text(text, text)
  from public, anon, authenticated

revoke all on function public.rosetta_v22_amendment_operations(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v22_canonical_output(integer)
  from public, anon, authenticated

revoke all on function public.rosetta_v22_finalize_extraction(integer, text, jsonb, jsonb)
  from public, anon, authenticated

commit
