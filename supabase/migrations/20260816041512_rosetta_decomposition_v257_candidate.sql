begin

do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.rosetta_v256_clean_amendment_operation_text(text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_amendment_operations(text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v256_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); v_definition:=replace(v_definition,'2.5.6','2.5.7'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); v_definition:=replace(v_definition,'2.5.6','2.5.7'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_canonical_output(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_reconcile_structural_correctness(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_reclassify_amendment_structure(integer,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_final_coverage(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_refresh_final_coverage_receipts(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.rosetta_v256_validate_independent_structure(integer,text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v256','v257'); execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.run_rosetta_v3_extraction_v256_candidate(','FUNCTION public.run_rosetta_v3_extraction_v257_candidate_base(');
  v_definition:=replace(v_definition,'v256','v257');
  v_definition:=replace(v_definition,'2.5.6','2.5.7');
  execute v_definition;
end;
$migration$

with canonical_manifest as (
  select jsonb_build_object(
    'contract','S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS} plus non-operative structural representations',
    'engine_version','rosetta-v3-deterministic-sql-2.5.7',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.7',
    'inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.6','rule_set_version','rosetta-five-layer-structural-correctness-2.5.6','status','admissible_diagnostic_receipt_return_stale'),
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'change',jsonb_build_object(
      'receipt_truthfulness','The execution receipt returns final hashed objects, structural representations, five-layer coverage, and row counts after all reclassification and validation.',
      'amendment_representation','Source-stated amendment instructions remain non-operative structural representations, not OVERRIDES objects.',
      'amendment_page_furniture','Recognized trailing legislative page furniture remains excluded from amendment-operation spans.',
      'coverage_block_scope','Every retained amendment document, section, and amendment-operation block receives all five operative layers as not_applicable.',
      'final_validation_order','No canonical meaning changes after final coverage, structural self-check, and independent validation.'
    ),
    'source_projection','rosetta-layout-projection-v25',
    'provenance','Rosetta 2.5.7 is a new immutable staged generation. 2.5.6 remains preserved diagnostic history.'
  ) manifest_json
),receipt as (
  select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') manifest_hash from canonical_manifest
)
insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
select 'rosetta-v3-deterministic-sql-2.5.7','rosetta-five-layer-structural-correctness-2.5.7',manifest_hash,manifest_json,true from receipt
on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true

create or replace function public.run_rosetta_v3_extraction_v257_candidate(
  p_source_document_id integer,p_source_text text,p_expected_source_content_hash text,
  p_source_url text,p_source_version text,p_media_type text default 'text/plain',
  p_source_byte_hash text default null,p_source_provider_hash text default null,
  p_reference_date date default null,p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set statement_timeout='120s'
set search_path=pg_catalog,public,extensions
as $$
declare
  v_receipt jsonb;
  v_run_id integer;
  v_row_counts jsonb;
  v_coverage jsonb;
  v_objects jsonb;
  v_structural jsonb;
begin
  v_receipt:=public.run_rosetta_v3_extraction_v257_candidate_base(
    p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,
    p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata
  );
  v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer;
  if v_run_id is null then return v_receipt; end if;

  select manifest.row_counts into v_row_counts from public.extraction_manifest manifest where manifest.extraction_run_id=v_run_id;
  v_coverage:=public.rosetta_v257_final_coverage(v_run_id);
  select coalesce(law.objects,'[]'::jsonb),coalesce(law.structural_representations,'[]'::jsonb)
    into v_objects,v_structural
  from public.v_rosetta_operator_law_view_v1 law where law.extraction_run_id=v_run_id;

  return v_receipt||jsonb_build_object(
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'coverage',coalesce(v_coverage,'{}'::jsonb),
    'row_counts',coalesce(v_row_counts,'{}'::jsonb),
    'objects',coalesce(v_objects,'[]'::jsonb),
    'structural_representations',coalesce(v_structural,'[]'::jsonb)
  );
end;
$$

revoke all on function public.rosetta_v257_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v257_amendment_operations(text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v257_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v257_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v257_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v257_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v257_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v257_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v257_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.rosetta_v257_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v257_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v257_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v257_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v257_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged immutable Rosetta 2.5.7 candidate. Returns a truthful final receipt containing the same final objects, structural representations, coverage, and row counts represented by the stored canonical generation.'

commit
