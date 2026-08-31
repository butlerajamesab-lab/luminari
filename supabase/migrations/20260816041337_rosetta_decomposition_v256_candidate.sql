begin

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.rosetta_v255_clean_amendment_operation_text(text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v255_clean_amendment_operation_text(','FUNCTION public.rosetta_v256_clean_amendment_operation_text(');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_amendment_operations(text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v255_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  v_definition:=replace(v_definition,'2.5.5','2.5.6');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  v_definition:=replace(v_definition,'2.5.5','2.5.6');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_canonical_output(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_reconcile_structural_correctness(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_reclassify_amendment_structure(integer,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_final_coverage(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_refresh_final_coverage_receipts(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v255_validate_independent_structure(integer,text)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v255_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'v255','v256');
  v_definition:=replace(v_definition,'2.5.5','2.5.6');
  execute v_definition;
end;
$migration$

with canonical_manifest as (
  select jsonb_build_object(
    'contract','S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS} plus non-operative structural representations',
    'engine_version','rosetta-v3-deterministic-sql-2.5.6',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.6',
    'inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.5','rule_set_version','rosetta-five-layer-structural-correctness-2.5.5','status','rejected_diagnostic_only'),
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'change',jsonb_build_object(
      'amendment_representation','Source-stated amendment instructions are non-operative structural representations, not OVERRIDES objects.',
      'amendment_page_furniture','Recognized trailing legislative page furniture is excluded from amendment-operation spans.',
      'coverage_block_scope','Every retained document, section, and amendment-operation block on an amendment instruction document receives all five operative layers as not_applicable.',
      'final_validation_order','Coverage, structural self-check, independent validation, and final output hash are regenerated only after final canonical structure is fixed.',
      'generation_immutability','2.5.5 remains frozen rejected history. 2.5.6 uses fresh generation-scoped IDs rather than revising a prior manifest in place.'
    ),
    'source_projection','rosetta-layout-projection-v25',
    'provenance','Rosetta 2.5.6 is a new immutable staged generation. Earlier 2.5.x receipts remain preserved.'
  ) manifest_json
), receipt as (
  select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') manifest_hash from canonical_manifest
)
insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
select 'rosetta-v3-deterministic-sql-2.5.6','rosetta-five-layer-structural-correctness-2.5.6',manifest_hash,manifest_json,true from receipt
on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true

revoke all on function public.rosetta_v256_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v256_amendment_operations(text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v256_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v256_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v256_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v256_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v256_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v256_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v256_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.rosetta_v256_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v256_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged immutable Rosetta 2.5.6 candidate. Carries the 2.5.5 structural-evidence model with corrected per-block amendment coverage from the initial 2.5.6 manifest; no 2.5.5 receipt is revised.'

commit
