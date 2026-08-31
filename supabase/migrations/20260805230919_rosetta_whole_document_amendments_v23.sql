create or replace function public.rosetta_v23_amendment_operations(
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
    v_operation := public.rosetta_v2_normalize_text(v_match[1]);
    v_start := strpos(p_source_text, v_operation);
    if v_start = 0 then
      raise exception using
        errcode = '22000',
        message = 'rosetta_v23_amendment_operation_offset_unresolved',
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
        message = 'rosetta_v23_amendment_operation_verb_missing',
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
$$

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.rosetta_v22_exact_definition_text(text,text)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta_v22_exact_definition_text%' then
    raise exception 'rosetta_v23_expected_v22_definition_helper_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v22_exact_definition_text(',
    'FUNCTION public.rosetta_v23_exact_definition_text('
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v22_canonical_output(integer)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-canonical-law-view-v22%' then
    raise exception 'rosetta_v23_expected_v22_canonical_output_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v22_canonical_output(',
    'FUNCTION public.rosetta_v23_canonical_output('
  );
  v_definition := replace(
    v_definition,
    'rosetta-canonical-law-view-v22',
    'rosetta-canonical-law-view-v23'
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v22_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.2.0%'
     or v_definition not like '%rosetta-five-layer-structural-correctness-2.2.0%' then
    raise exception 'rosetta_v23_expected_v22_base_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.run_rosetta_v3_extraction_v22_base(',
    'FUNCTION public.run_rosetta_v3_extraction_v23_base('
  );
  v_definition := replace(
    v_definition,
    'rosetta-v3-deterministic-sql-2.2.0',
    'rosetta-v3-deterministic-sql-2.3.0'
  );
  v_definition := replace(
    v_definition,
    'rosetta-five-layer-structural-correctness-2.2.0',
    'rosetta-five-layer-structural-correctness-2.3.0'
  );
  v_definition := replace(v_definition, '-v22-', '-v23-');
  v_definition := replace(
    v_definition,
    'v_source_identity_hash || ''',
    'v_source_identity_hash || ''-'' || v_configuration_hash || '''
  );
  v_definition := replace(
    v_definition,
    '''cfg-v23-'' || v_source_identity_hash,',
    '''cfg-v23-'' || v_source_identity_hash || ''-'' || v_configuration_hash,'
  );
  v_definition := replace(
    v_definition,
    '''manifest-v23-'' || v_source_identity_hash,',
    '''manifest-v23-'' || v_source_identity_hash || ''-'' || v_configuration_hash,'
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v22_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta_v22_amendment_operations%'
     or v_definition not like '%rosetta_v22_canonical_output%' then
    raise exception 'rosetta_v23_expected_v22_finalizer_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v22_finalize_extraction(',
    'FUNCTION public.rosetta_v23_finalize_extraction('
  );
  v_definition := replace(
    v_definition,
    'rosetta_v22_exact_definition_text',
    'rosetta_v23_exact_definition_text'
  );
  v_definition := replace(
    v_definition,
    'rosetta_v22_amendment_operations',
    'rosetta_v23_amendment_operations'
  );
  v_definition := replace(
    v_definition,
    'rosetta_v22_canonical_output',
    'rosetta_v23_canonical_output'
  );
  v_definition := replace(
    v_definition,
    'rosetta-v3-deterministic-sql-2.2.0',
    'rosetta-v3-deterministic-sql-2.3.0'
  );
  v_definition := replace(
    v_definition,
    'rosetta-five-layer-structural-correctness-2.2.0',
    'rosetta-five-layer-structural-correctness-2.3.0'
  );
  v_definition := replace(v_definition, '-v22-', '-v23-');
  v_definition := replace(
    v_definition,
    'rosetta-canonical-law-view-v22',
    'rosetta-canonical-law-view-v23'
  );
  v_definition := replace(
    v_definition,
    'rosetta-structural-correctness-v22',
    'rosetta-structural-correctness-v23'
  );
  v_definition := replace(
    v_definition,
    'exact_source_structure_v22',
    'exact_source_structure_v23'
  );
  v_definition := replace(
    v_definition,
    'v_run.source_identity_hash || ''',
    'v_run.source_identity_hash || ''-'' || v_run.configuration_hash || '''
  );
  v_definition := replace(
    v_definition,
    'operation.override_scope !~* ''^On page ''',
    'operation.override_scope !~* ''^(On page |Strike everything after the enacting clause)'''
  );
  v_definition := replace(
    v_definition,
    '''replayed'', false',
    '''replayed'', coalesce((p_base_receipt ->> ''replayed'')::boolean, false)'
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%run_rosetta_v3_extraction_v22_base%' then
    raise exception 'rosetta_v23_expected_v22_wrapper_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.run_rosetta_v3_extraction(',
    'FUNCTION public.run_rosetta_v3_extraction_v22_legacy('
  );
  execute v_definition;
end;
$migration$

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-2.3.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.3.0',
    'inherits', jsonb_build_object(
      'engine_version', 'rosetta-v3-deterministic-sql-2.2.0',
      'rule_set_version', 'rosetta-five-layer-structural-correctness-2.2.0'
    ),
    'amendment_operations', jsonb_build_object(
      'accepted_source_grammars', jsonb_build_array(
        'On page ... strike/insert/delete/renumber ...',
        'Strike everything after the enacting clause and insert the following: ...'
      ),
      'object_layer', 'OVERRIDES',
      'override_type', 'source_stated_amendment_operation',
      'legal_effect', 'not inferred or applied',
      'target_locator', 'exact source prefix preceding the governed operation body'
    ),
    'configuration_identity', jsonb_build_object(
      'scope', 'engine generation plus source identity plus configuration hash',
      'purpose', 'prevent cross-configuration canonical identifier collisions'
    ),
    'definition_text', jsonb_build_object(
      'rule', 'Definition text must occur exactly in the normalized immutable source snapshot, including operator punctuation.'
    ),
    'validation', jsonb_build_array(
      'all definition text occurs exactly in source',
      'every amendment operation occurs exactly in source',
      'operation kind matches source markers',
      'all five terminal layer receipts exist',
      'canonical identifiers are configuration scoped'
    ),
    'provenance', 'Rosetta records exact source-stated operations and never constructs or infers amended legal effect.'
  ) as manifest_json
),
canonical_receipt as (
  select
    manifest_json,
    encode(
      digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'),
      'hex'
    ) as manifest_hash
  from canonical_manifest
)
insert into public.extraction_rule_manifest (
  engine_version,
  rule_set_version,
  manifest_hash,
  manifest_json,
  is_active
)
select
  'rosetta-v3-deterministic-sql-2.3.0',
  'rosetta-five-layer-structural-correctness-2.3.0',
  manifest_hash,
  manifest_json,
  true
from canonical_receipt
on conflict (engine_version, rule_set_version) do update
set manifest_hash = excluded.manifest_hash,
    manifest_json = excluded.manifest_json,
    is_active = true

create or replace function public.run_rosetta_v3_extraction(
  p_source_document_id integer,
  p_source_text text,
  p_expected_source_content_hash text,
  p_source_url text,
  p_source_version text,
  p_media_type text default 'text/plain',
  p_source_byte_hash text default null,
  p_source_provider_hash text default null,
  p_reference_date date default null,
  p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout = '120s'
set search_path = pg_catalog, public, extensions
as $$
declare
  v_receipt jsonb;
  v_run_id integer;
begin
  v_receipt := public.run_rosetta_v3_extraction_v23_base(
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

  if coalesce(v_receipt ->> 'run_status', '') <> 'completed'
     or coalesce(v_receipt ->> 'admissibility_state', '') <> 'admissible' then
    return v_receipt;
  end if;

  v_run_id := nullif(v_receipt ->> 'extraction_run_id', '')::integer;
  if v_run_id is null then
    return v_receipt;
  end if;

  return public.rosetta_v23_finalize_extraction(
    v_run_id,
    p_source_text,
    coalesce(p_source_metadata, '{}'::jsonb),
    v_receipt
  );
end;
$$

revoke all on function public.rosetta_v23_exact_definition_text(text, text)
  from public, anon, authenticated

revoke all on function public.rosetta_v23_amendment_operations(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v23_canonical_output(integer)
  from public, anon, authenticated

revoke all on function public.rosetta_v23_finalize_extraction(integer, text, jsonb, jsonb)
  from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction_v23_base(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction_v22_legacy(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated
