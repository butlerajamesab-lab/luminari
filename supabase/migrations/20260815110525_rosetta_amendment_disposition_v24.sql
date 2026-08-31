begin

alter table public.entity_override
  drop constraint if exists entity_override_temporal_status_check

alter table public.entity_override
  add constraint entity_override_temporal_status_check check (
    temporal_status in (
      'pending', 'active', 'expired', 'superseded',
      'adopted', 'not_adopted', 'unknown'
    )
  )

create or replace function public.rosetta_v24_amendment_disposition(
  p_source_text text,
  p_source_metadata jsonb
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_metadata_disposition text;
  v_source_disposition text;
  v_normalized_source text := public.rosetta_v2_normalize_text(p_source_text);
begin
  if jsonb_typeof(coalesce(p_source_metadata, '{}'::jsonb) -> 'docket_adopted') = 'boolean' then
    v_metadata_disposition := case
      when (p_source_metadata ->> 'docket_adopted')::boolean then 'adopted'
      else 'not_adopted'
    end;
  end if;

  if v_normalized_source ~* '\mNOT\s+ADOPTED\M' then
    v_source_disposition := 'not_adopted';
  elsif v_normalized_source ~* '\mADOPTED\M' then
    v_source_disposition := 'adopted';
  end if;

  if v_metadata_disposition is not null
     and v_source_disposition is not null
     and v_metadata_disposition <> v_source_disposition then
    raise exception using
      errcode = '22000',
      message = 'rosetta_v24_amendment_disposition_conflict',
      detail = jsonb_build_object(
        'metadata_disposition', v_metadata_disposition,
        'source_disposition', v_source_disposition
      )::text;
  end if;

  return coalesce(v_metadata_disposition, v_source_disposition, 'unknown');
end;
$$

create or replace function public.rosetta_v24_prune_amendment_projection(
  p_extraction_run_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_coverage_count integer := 0;
begin
  delete from public.term_definition_affected_steps affected
   where affected.term_definition_id in (
     select definition.id
     from public.term_definition definition
     where definition.extraction_run_id = p_extraction_run_id
   )
      or affected.workflow_step_id in (
     select step.id
     from public.workflow_step step
     join public.workflow_pipeline pipeline
       on pipeline.id = step.workflow_pipeline_id
     where pipeline.extraction_run_id = p_extraction_run_id
   );

  if to_regclass('public.rosetta_object_correction') is not null then
    execute 'delete from public.rosetta_object_correction where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;
  if to_regclass('public.rosetta_structural_repair_queue') is not null then
    execute 'delete from public.rosetta_structural_repair_queue where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;

  delete from public.help_entity
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_help_count = row_count;

  delete from public.workflow_pipeline
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_workflow_count = row_count;

  delete from public.accountability_route
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_accountability_count = row_count;

  delete from public.entity_override
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_override_count = row_count;

  delete from public.term_definition
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_definition_count = row_count;

  delete from public.layer_coverage
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
$$

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.rosetta_v23_exact_definition_text(text,text)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta_v23_exact_definition_text%' then
    raise exception 'rosetta_v24_expected_v23_definition_helper_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v23_exact_definition_text(',
    'FUNCTION public.rosetta_v24_exact_definition_text('
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v23_amendment_operations(text)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta_v23_amendment_operations%' then
    raise exception 'rosetta_v24_expected_v23_amendment_helper_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v23_amendment_operations(',
    'FUNCTION public.rosetta_v24_amendment_operations('
  );
  v_definition := replace(v_definition, 'rosetta_v23_', 'rosetta_v24_');
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v23_canonical_output(integer)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-canonical-law-view-v23%' then
    raise exception 'rosetta_v24_expected_v23_canonical_output_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v23_canonical_output(',
    'FUNCTION public.rosetta_v24_canonical_output('
  );
  v_definition := replace(
    v_definition,
    'rosetta-canonical-law-view-v23',
    'rosetta-canonical-law-view-v24'
  );
  execute v_definition;

  select pg_get_functiondef(
    'public.run_rosetta_v3_extraction_v23_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.3.0%'
     or v_definition not like '%rosetta-five-layer-structural-correctness-2.3.0%' then
    raise exception 'rosetta_v24_expected_v23_base_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.run_rosetta_v3_extraction_v23_base(',
    'FUNCTION public.run_rosetta_v3_extraction_v24_base('
  );
  v_definition := replace(
    v_definition,
    'rosetta-v3-deterministic-sql-2.3.0',
    'rosetta-v3-deterministic-sql-2.4.0'
  );
  v_definition := replace(
    v_definition,
    'rosetta-five-layer-structural-correctness-2.3.0',
    'rosetta-five-layer-structural-correctness-2.4.0'
  );
  v_definition := replace(v_definition, '-v23-', '-v24-');
  v_definition := replace(v_definition, '''cfg-v23-', '''cfg-v24-');
  v_definition := replace(v_definition, '''manifest-v23-', '''manifest-v24-');
  execute v_definition;

  select pg_get_functiondef(
    'public.rosetta_v23_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure
  ) into v_definition;
  if v_definition not like '%rosetta_v23_amendment_operations%'
     or v_definition not like '%rosetta_v23_canonical_output%' then
    raise exception 'rosetta_v24_expected_v23_finalizer_missing';
  end if;
  v_definition := replace(
    v_definition,
    'FUNCTION public.rosetta_v23_finalize_extraction(',
    'FUNCTION public.rosetta_v24_finalize_extraction('
  );
  v_definition := replace(
    v_definition,
    'rosetta_v23_exact_definition_text',
    'rosetta_v24_exact_definition_text'
  );
  v_definition := replace(
    v_definition,
    'rosetta_v23_amendment_operations',
    'rosetta_v24_amendment_operations'
  );
  v_definition := replace(
    v_definition,
    'rosetta_v23_canonical_output',
    'rosetta_v24_canonical_output'
  );
  v_definition := replace(
    v_definition,
    'rosetta-v3-deterministic-sql-2.3.0',
    'rosetta-v3-deterministic-sql-2.4.0'
  );
  v_definition := replace(
    v_definition,
    'rosetta-five-layer-structural-correctness-2.3.0',
    'rosetta-five-layer-structural-correctness-2.4.0'
  );
  v_definition := replace(v_definition, '-v23-', '-v24-');
  v_definition := replace(
    v_definition,
    'rosetta-canonical-law-view-v23',
    'rosetta-canonical-law-view-v24'
  );
  v_definition := replace(
    v_definition,
    'rosetta-structural-correctness-v23',
    'rosetta-structural-correctness-v24'
  );
  v_definition := replace(
    v_definition,
    'exact_source_structure_v23',
    'exact_source_structure_v24'
  );
  v_definition := replace(
    v_definition,
    E'where sd.id = v_run.source_document_id;\n\n  update public.term_definition definition',
    E'where sd.id = v_run.source_document_id;\n\n  if v_document_family = ''amendment'' then\n    perform public.rosetta_v24_prune_amendment_projection(p_extraction_run_id);\n  end if;\n\n  update public.term_definition definition'
  );
  if v_definition not like '%rosetta_v24_prune_amendment_projection%' then
    raise exception 'rosetta_v24_finalizer_prune_injection_failed';
  end if;
  v_definition := replace(
    v_definition,
    E'''pending'',\n        1.00,',
    E'public.rosetta_v24_amendment_disposition(p_source_text, p_source_metadata),\n        1.00,'
  );
  if v_definition not like '%rosetta_v24_amendment_disposition(p_source_text, p_source_metadata)%' then
    raise exception 'rosetta_v24_finalizer_disposition_injection_failed';
  end if;
  v_definition := replace(
    v_definition,
    '''document_family'', nullif(v_document_family, '''')',
    E'''document_family'', nullif(v_document_family, ''''),\n    ''amendment_disposition'', case when v_document_family = ''amendment''\n      then public.rosetta_v24_amendment_disposition(p_source_text, p_source_metadata)\n      else null end'
  );
  execute v_definition;
end;
$migration$

with canonical_manifest as (
  select jsonb_build_object(
    'contract', 'S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version', 'rosetta-v3-deterministic-sql-2.4.0',
    'rule_set_version', 'rosetta-five-layer-structural-correctness-2.4.0',
    'inherits', jsonb_build_object(
      'engine_version', 'rosetta-v3-deterministic-sql-2.3.0',
      'rule_set_version', 'rosetta-five-layer-structural-correctness-2.3.0'
    ),
    'amendment_operations', jsonb_build_object(
      'source_rule', 'An amendment instruction is a proposal/history artifact, never an operative-law workflow source.',
      'disposition_sources', jsonb_build_array(
        'Docket docket_adopted metadata',
        'explicit ADOPTED or NOT ADOPTED source header'
      ),
      'conflict_policy', 'Fail closed when Docket disposition and the source header disagree.',
      'object_layer', 'OVERRIDES',
      'override_type', 'source_stated_amendment_operation',
      'legal_effect', 'not inferred or applied',
      'non_override_layers', 'not_applicable',
      'operative_projection', 'prohibited for amendment instruction documents'
    ),
    'provenance', 'Prior generations and receipts remain immutable. Version 2.4 creates a new generation and never rewrites v2.3 output.'
  ) as manifest_json
), canonical_receipt as (
  select manifest_json,
         encode(digest(convert_to(manifest_json::text, 'UTF8'), 'sha256'), 'hex') as manifest_hash
  from canonical_manifest
)
insert into public.extraction_rule_manifest (
  engine_version, rule_set_version, manifest_hash, manifest_json, is_active
)
select
  'rosetta-v3-deterministic-sql-2.4.0',
  'rosetta-five-layer-structural-correctness-2.4.0',
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
  v_reconciliation jsonb;
  v_output jsonb;
  v_output_hash text;
begin
  v_receipt := public.run_rosetta_v3_extraction_v24_base(
    p_source_document_id, p_source_text, p_expected_source_content_hash,
    p_source_url, p_source_version, p_media_type, p_source_byte_hash,
    p_source_provider_hash, p_reference_date, p_text_extractor_version,
    p_source_metadata
  );

  if coalesce(v_receipt ->> 'run_status', '') <> 'completed'
     or coalesce(v_receipt ->> 'admissibility_state', '') <> 'admissible' then
    return v_receipt;
  end if;

  v_run_id := nullif(v_receipt ->> 'extraction_run_id', '')::integer;
  if v_run_id is null then return v_receipt; end if;

  v_receipt := public.rosetta_v24_finalize_extraction(
    v_run_id, p_source_text, coalesce(p_source_metadata, '{}'::jsonb), v_receipt
  );

  if to_regprocedure('public.rosetta_reconcile_structural_correctness(integer)') is not null then
    execute 'select public.rosetta_reconcile_structural_correctness($1)'
       into v_reconciliation
      using v_run_id;
  else
    v_reconciliation := jsonb_build_object(
      'contract', 'rosetta-structural-reconciliation-not-configured',
      'extraction_run_id', v_run_id
    );
  end if;

  v_output := public.rosetta_v24_canonical_output(v_run_id);
  v_output_hash := encode(digest(convert_to(v_output::text, 'UTF8'), 'sha256'), 'hex');

  update public.extraction_run
     set output_content_hash = v_output_hash
   where id = v_run_id;
  update public.extraction_manifest
     set output_hash = v_output_hash,
         validation_results = coalesce(validation_results, '{}'::jsonb)
           || jsonb_build_object('structural_reconciliation_v1', v_reconciliation)
   where extraction_run_id = v_run_id;

  return v_receipt || jsonb_build_object(
    'output_content_hash', v_output_hash,
    'structural_reconciliation', v_reconciliation,
    'amendment_disposition', case
      when lower(coalesce(p_source_metadata ->> 'docket_document_family', '')) = 'amendment'
      then public.rosetta_v24_amendment_disposition(p_source_text, p_source_metadata)
      else null
    end
  );
end;
$$

revoke all on function public.rosetta_v24_amendment_disposition(text, jsonb)
  from public, anon, authenticated

revoke all on function public.rosetta_v24_prune_amendment_projection(integer)
  from public, anon, authenticated

revoke all on function public.rosetta_v24_exact_definition_text(text, text)
  from public, anon, authenticated

revoke all on function public.rosetta_v24_amendment_operations(text)
  from public, anon, authenticated

revoke all on function public.rosetta_v24_canonical_output(integer)
  from public, anon, authenticated

revoke all on function public.rosetta_v24_finalize_extraction(integer, text, jsonb, jsonb)
  from public, anon, authenticated

revoke all on function public.run_rosetta_v3_extraction_v24_base(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) from public, anon, authenticated

grant execute on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) to service_role

comment on function public.run_rosetta_v3_extraction(
  integer, text, text, text, text, text, text, text, date, text, jsonb
) is
  'Rosetta 2.4 deterministic extraction. Amendment instructions retain exact proposal/history operations and disposition but cannot emit operative legal workflows.'

commit
