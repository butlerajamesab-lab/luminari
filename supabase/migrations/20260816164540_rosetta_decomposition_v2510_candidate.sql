begin

update public.extraction_rule_manifest
set is_active=false
where engine_version='rosetta-v3-deterministic-sql-2.5.9'
  and rule_set_version='rosetta-five-layer-structural-correctness-2.5.9'

revoke execute on function public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from service_role

comment on function public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Frozen staging definition with zero persisted runs. Amendment-aware final self-check was applied too early inside the base parser before amendment projection. Correct stage ordering moves to Rosetta 2.5.10.'

do $clone$
declare
  v_definition text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.rosetta_v259_amendment_disposition(text,jsonb)',
    'public.rosetta_v259_clean_amendment_operation_text(text)',
    'public.rosetta_v259_amendment_operations(text)',
    'public.rosetta_v259_canonical_output(integer)',
    'public.rosetta_v259_finalize_extraction(integer,text,jsonb,jsonb)',
    'public.rosetta_v259_reclassify_amendment_structure(integer,text,jsonb)',
    'public.rosetta_v259_reconcile_structural_correctness(integer)',
    'public.rosetta_v259_final_coverage(integer)',
    'public.rosetta_v259_refresh_final_coverage_receipts(integer)',
    'public.rosetta_v259_validate_extraction(integer,text)',
    'public.rosetta_v259_validate_independent_structure(integer,text)',
    'public.run_rosetta_v3_extraction_v259_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v259_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if v_definition is null then raise exception 'rosetta_v2510_clone_source_missing:%',v_signature; end if;
    v_definition:=replace(v_definition,'v259','v2510');
    v_definition:=replace(v_definition,'2.5.9','2.5.10');
    execute v_definition;
  end loop;
end;
$clone$

do $base_stage_order$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.run_rosetta_v3_extraction_v2510_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition:=replace(v_definition,'public.rosetta_v2510_validate_extraction','public.rosetta_v25_validate_extraction');
  execute v_definition;
end;
$base_stage_order$

do $manifest$
declare
  v_prior jsonb;
  v_manifest jsonb;
  v_hash text;
begin
  select manifest_json into v_prior
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.9'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.9';
  if v_prior is null then raise exception 'rosetta_v2510_prior_manifest_missing'; end if;

  v_manifest:=v_prior
    || jsonb_build_object(
      'engine_version','rosetta-v3-deterministic-sql-2.5.10',
      'rule_set_version','rosetta-five-layer-structural-correctness-2.5.10',
      'inherits',jsonb_build_object(
        'engine_version','rosetta-v3-deterministic-sql-2.5.9',
        'rule_set_version','rosetta-five-layer-structural-correctness-2.5.9',
        'status','zero_persisted_runs_stage_order_diagnostic'
      ),
      'provenance','Rosetta 2.5.10 is a new immutable staged generation. 2.5.9 is frozen with zero persisted runs; 2.5.8 remains the current published generation until explicit promotion.'
    )
    || jsonb_build_object(
      'change',coalesce(v_prior->'change','{}'::jsonb)||jsonb_build_object(
        'amendment_validation_stage_order','The base parser retains raw-source structural self-check semantics before projection. Amendment-aware expected operative workflow = 0 is enforced only after finalizer reclassification/pruning, so temporary base workflow rows do not fail the pre-projection stage.'
      )
    );
  v_hash:=encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
  values('rosetta-v3-deterministic-sql-2.5.10','rosetta-five-layer-structural-correctness-2.5.10',v_hash,v_manifest,true)
  on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true;
end;
$manifest$

revoke all on function public.rosetta_v2510_amendment_disposition(text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2510_validate_extraction(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2510_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v2510_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v2510_amendment_operations(text) from public,anon,authenticated

revoke all on function public.rosetta_v2510_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2510_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2510_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v2510_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2510_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v2510_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v2510_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2510_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2510_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v2510_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v2510_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged Rosetta 2.5.10 candidate. Preserves replay-safe 2.5.8 structural handoff, narrows amendment disposition status evidence, and applies zero operative-workflow expectation only after amendment projection. Does not change the current-generation registry.'

commit
