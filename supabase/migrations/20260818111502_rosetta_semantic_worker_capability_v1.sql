begin

create or replace function public.rosetta_semantic_worker_candidates_v1(
  p_capability_token text,
  p_parser_version text,
  p_before_id integer default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_limit integer;
  v_rows jsonb;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if nullif(btrim(p_parser_version), '') is null then
    raise exception using errcode = '22023', message = 'semantic_worker_parser_version_required';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

  select coalesce(jsonb_agg(to_jsonb(candidate) order by candidate.id desc), '[]'::jsonb)
    into v_rows
  from (
    select
      run.id,
      run.source_document_id,
      run.engine_version,
      run.rule_set_version,
      run.run_status,
      run.admissibility_state,
      run.created_at,
      run.completed_at
    from public.extraction_run run
    where run.run_status = 'completed'
      and run.admissibility_state = 'admissible'
      and (p_before_id is null or run.id < p_before_id)
      and not exists (
        select 1
        from public.rosetta_semantic_shadow_run semantic_run
        where semantic_run.extraction_run_id = run.id
          and semantic_run.parser_version = p_parser_version
      )
    order by run.id desc
    limit v_limit
  ) candidate;

  return v_rows;
end;
$$

revoke all on function public.rosetta_semantic_worker_candidates_v1(text, text, integer, integer) from public

grant execute on function public.rosetta_semantic_worker_candidates_v1(text, text, integer, integer)
  to anon, authenticated, service_role

create or replace function public.rosetta_semantic_worker_input_v1(
  p_capability_token text,
  p_run_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_run jsonb;
  v_source_content_id uuid;
  v_source_receipt jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_definitions jsonb := '[]'::jsonb;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if p_run_id is null or p_run_id <= 0 then
    raise exception using errcode = '22023', message = 'semantic_worker_run_id_invalid';
  end if;

  select jsonb_build_object(
      'id', run.id,
      'source_document_id', run.source_document_id,
      'source_content_id', run.source_content_id,
      'engine_version', run.engine_version,
      'rule_set_version', run.rule_set_version,
      'rule_manifest_hash', run.rule_manifest_hash,
      'source_identity_hash', run.source_identity_hash,
      'source_content_hash', run.source_content_hash,
      'output_content_hash', run.output_content_hash,
      'admissibility_state', run.admissibility_state,
      'run_status', run.run_status
    ), run.source_content_id
    into v_run, v_source_content_id
  from public.extraction_run run
  where run.id = p_run_id;

  if v_run is null then
    raise exception using errcode = 'P0002', message = 'semantic_worker_run_not_found';
  end if;

  if coalesce(v_run->>'run_status', '') <> 'completed'
     or coalesce(v_run->>'admissibility_state', '') <> 'admissible' then
    raise exception using errcode = '22023', message = 'semantic_worker_run_not_admissible';
  end if;

  if v_source_content_id is not null then
    select jsonb_build_object(
      'source_content_id', receipt.source_content_id,
      'source_document_id', receipt.source_document_id,
      'source_text', receipt.source_text,
      'source_content_hash', receipt.source_content_hash,
      'source_identity_hash', receipt.source_identity_hash,
      'source_version', receipt.source_version,
      'source_url', receipt.source_url,
      'media_type', receipt.media_type
    )
      into v_source_receipt
    from public.source_document_content receipt
    where receipt.source_content_id = v_source_content_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(block_row) order by block_row.char_offset_start, block_row.id), '[]'::jsonb)
    into v_blocks
  from (
    select
      block.id,
      block.block_type,
      block.section_number,
      block.block_content_hash,
      block.char_offset_start,
      block.char_offset_end
    from public.hr1_raw_blocks block
    where block.extraction_run_id = p_run_id
      and block.block_type = 'section'
    order by block.char_offset_start, block.id
  ) block_row;

  select coalesce(jsonb_agg(to_jsonb(definition_row) order by definition_row.defined_term, definition_row.id), '[]'::jsonb)
    into v_definitions
  from (
    select
      definition.id,
      definition.defined_term,
      definition.definition_text,
      definition.defining_section,
      definition.source_block_id
    from public.term_definition definition
    where definition.extraction_run_id = p_run_id
    order by definition.defined_term, definition.id
  ) definition_row;

  return jsonb_build_object(
    'run', v_run,
    'source_receipt', v_source_receipt,
    'blocks', v_blocks,
    'canonical_definitions', v_definitions
  );
end;
$$

revoke all on function public.rosetta_semantic_worker_input_v1(text, integer) from public

grant execute on function public.rosetta_semantic_worker_input_v1(text, integer)
  to anon, authenticated, service_role

create or replace function public.rosetta_semantic_worker_persist_v1(
  p_capability_token text,
  p_clause_rows jsonb,
  p_semantic_rows jsonb,
  p_completion_row jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_run_id integer;
  v_parser_version text;
  v_expected_clause_rows jsonb;
  v_observed_clause_rows jsonb;
  v_expected_semantic_rows jsonb;
  v_observed_semantic_rows jsonb;
  v_observed_completion jsonb;
  v_existing_completion boolean;
begin
  perform public.rosetta_assert_backend_capability_v1(p_capability_token, 'standalone_backend');

  if jsonb_typeof(coalesce(p_clause_rows, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_semantic_rows, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_completion_row, 'null'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'semantic_worker_persist_payload_invalid';
  end if;

  v_run_id := nullif(p_completion_row->>'extraction_run_id', '')::integer;
  v_parser_version := nullif(p_completion_row->>'parser_version', '');

  if v_run_id is null or v_run_id <= 0 or nullif(btrim(v_parser_version), '') is null then
    raise exception using errcode = '22023', message = 'semantic_worker_persist_identity_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_clause_rows) row_value
    where nullif(row_value->>'extraction_run_id', '')::integer is distinct from v_run_id
       or nullif(row_value->>'parser_version', '') is distinct from v_parser_version
  ) or exists (
    select 1
    from jsonb_array_elements(p_semantic_rows) row_value
    where nullif(row_value->>'extraction_run_id', '')::integer is distinct from v_run_id
       or nullif(row_value->>'parser_version', '') is distinct from v_parser_version
  ) then
    raise exception using errcode = '22023', message = 'semantic_worker_persist_identity_mismatch';
  end if;

  select coalesce(jsonb_agg(value order by value->>'source_block_id', (value->>'clause_index')::integer), '[]'::jsonb)
    into v_expected_clause_rows
  from jsonb_array_elements(p_clause_rows) value;

  select coalesce(jsonb_agg(value order by value->>'test_name'), '[]'::jsonb)
    into v_expected_semantic_rows
  from jsonb_array_elements(p_semantic_rows) value;

  select exists (
    select 1
    from public.rosetta_semantic_shadow_run completion
    where completion.extraction_run_id = v_run_id
      and completion.parser_version = v_parser_version
  ) into v_existing_completion;

  if not v_existing_completion then
    insert into public.rosetta_clause_ir (
      extraction_run_id,
      source_document_id,
      source_block_id,
      parser_version,
      clause_index,
      source_text,
      char_offset_start,
      char_offset_end,
      source_content_hash,
      clause_kind,
      actor_text,
      actor_canon_id,
      actor_role,
      modal,
      action_text,
      object_text,
      condition_text,
      deadline_text,
      exception_text,
      enumeration_status,
      parse_status,
      diagnostics,
      normalized_value
    )
    select
      row_value.extraction_run_id,
      row_value.source_document_id,
      row_value.source_block_id,
      row_value.parser_version,
      row_value.clause_index,
      row_value.source_text,
      row_value.char_offset_start,
      row_value.char_offset_end,
      row_value.source_content_hash,
      row_value.clause_kind,
      row_value.actor_text,
      row_value.actor_canon_id,
      row_value.actor_role,
      row_value.modal,
      row_value.action_text,
      row_value.object_text,
      row_value.condition_text,
      row_value.deadline_text,
      row_value.exception_text,
      row_value.enumeration_status,
      row_value.parse_status,
      row_value.diagnostics,
      row_value.normalized_value
    from jsonb_to_recordset(p_clause_rows) as row_value(
      extraction_run_id integer,
      source_document_id integer,
      source_block_id text,
      parser_version text,
      clause_index integer,
      source_text text,
      char_offset_start integer,
      char_offset_end integer,
      source_content_hash text,
      clause_kind text,
      actor_text text,
      actor_canon_id text,
      actor_role text,
      modal text,
      action_text text,
      object_text text,
      condition_text text,
      deadline_text text,
      exception_text text,
      enumeration_status text,
      parse_status text,
      diagnostics jsonb,
      normalized_value jsonb
    )
    on conflict (extraction_run_id, parser_version, source_block_id, clause_index) do nothing;

    insert into public.rosetta_semantic_receipt (
      extraction_run_id,
      parser_version,
      test_name,
      passed,
      failure_count,
      failures,
      input_hash,
      output_hash
    )
    select
      row_value.extraction_run_id,
      row_value.parser_version,
      row_value.test_name,
      row_value.passed,
      row_value.failure_count,
      row_value.failures,
      row_value.input_hash,
      row_value.output_hash
    from jsonb_to_recordset(p_semantic_rows) as row_value(
      extraction_run_id integer,
      parser_version text,
      test_name text,
      passed boolean,
      failure_count integer,
      failures jsonb,
      input_hash text,
      output_hash text
    )
    on conflict (extraction_run_id, parser_version, test_name) do nothing;
  end if;

  select coalesce(
      jsonb_agg(to_jsonb(observed) - 'id' - 'created_at' order by observed.source_block_id, observed.clause_index),
      '[]'::jsonb
    )
    into v_observed_clause_rows
  from public.rosetta_clause_ir observed
  where observed.extraction_run_id = v_run_id
    and observed.parser_version = v_parser_version;

  select coalesce(
      jsonb_agg(to_jsonb(observed) - 'id' - 'created_at' order by observed.test_name),
      '[]'::jsonb
    )
    into v_observed_semantic_rows
  from public.rosetta_semantic_receipt observed
  where observed.extraction_run_id = v_run_id
    and observed.parser_version = v_parser_version;

  if v_observed_clause_rows is distinct from v_expected_clause_rows then
    raise exception using errcode = '23505', message = 'semantic_clause_ir_replay_conflict';
  end if;

  if v_observed_semantic_rows is distinct from v_expected_semantic_rows then
    raise exception using errcode = '23505', message = 'semantic_receipt_replay_conflict';
  end if;

  if not v_existing_completion then
    insert into public.rosetta_semantic_shadow_run (
      extraction_run_id,
      parser_version,
      source_content_hash,
      clause_count,
      semantic_receipt_count,
      validation_pass,
      receipt_hash,
      state
    ) values (
      v_run_id,
      v_parser_version,
      p_completion_row->>'source_content_hash',
      (p_completion_row->>'clause_count')::integer,
      (p_completion_row->>'semantic_receipt_count')::integer,
      (p_completion_row->>'validation_pass')::boolean,
      p_completion_row->>'receipt_hash',
      p_completion_row->>'state'
    )
    on conflict (extraction_run_id, parser_version) do nothing;
  end if;

  select to_jsonb(completion) - 'completed_at'
    into v_observed_completion
  from public.rosetta_semantic_shadow_run completion
  where completion.extraction_run_id = v_run_id
    and completion.parser_version = v_parser_version;

  if v_observed_completion is distinct from p_completion_row then
    raise exception using errcode = '23505', message = 'semantic_shadow_completion_replay_conflict';
  end if;

  return jsonb_build_object(
    'ok', true,
    'complete', true,
    'replayed', v_existing_completion,
    'extraction_run_id', v_run_id,
    'parser_version', v_parser_version,
    'clause_count', jsonb_array_length(p_clause_rows),
    'semantic_receipt_count', jsonb_array_length(p_semantic_rows),
    'semantic_receipt_hash', p_completion_row->>'receipt_hash'
  );
end;
$$

revoke all on function public.rosetta_semantic_worker_persist_v1(text, jsonb, jsonb, jsonb) from public

grant execute on function public.rosetta_semantic_worker_persist_v1(text, jsonb, jsonb, jsonb)
  to anon, authenticated, service_role

comment on function public.rosetta_semantic_worker_candidates_v1(text, text, integer, integer) is
  'Capability-gated newest-first selector for completed/admissible Rosetta runs that lack the requested semantic parser completion receipt.'

comment on function public.rosetta_semantic_worker_input_v1(text, integer) is
  'Capability-gated exact semantic input bundle: immutable source receipt, section block receipts, and canonical definitions for one admissible Rosetta run.'

comment on function public.rosetta_semantic_worker_persist_v1(text, jsonb, jsonb, jsonb) is
  'Capability-gated atomic replay-safe persistence boundary for semantic clause IR, semantic validation receipts, and immutable completion.'

commit
