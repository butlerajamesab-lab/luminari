do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.rosetta_v253_canonical_output(integer)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v253_canonical_output(','FUNCTION public.rosetta_v254_canonical_output(');
  v_definition:=replace(v_definition,'rosetta-canonical-law-view-v253','rosetta-canonical-law-view-v254');
  v_definition:=replace(v_definition,'FROM public.v_civic_genome_law_view_v1','FROM public.v_rosetta_operator_law_view_v1');
  v_definition:=replace(v_definition,'from public.v_civic_genome_law_view_v1','from public.v_rosetta_operator_law_view_v1');
  execute v_definition;

  select pg_get_functiondef('public.run_rosetta_v3_extraction_v253_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.5.3%' then raise exception 'rosetta_v254_expected_v253_base_missing'; end if;
  v_definition:=replace(v_definition,'FUNCTION public.run_rosetta_v3_extraction_v253_base(','FUNCTION public.run_rosetta_v3_extraction_v254_base(');
  v_definition:=replace(v_definition,'rosetta-v3-deterministic-sql-2.5.3','rosetta-v3-deterministic-sql-2.5.4');
  v_definition:=replace(v_definition,'rosetta-five-layer-structural-correctness-2.5.3','rosetta-five-layer-structural-correctness-2.5.4');
  v_definition:=replace(v_definition,'-v253-','-v254-');
  execute v_definition;

  select pg_get_functiondef('public.rosetta_v253_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure) into v_definition;
  if v_definition not like '%rosetta-v3-deterministic-sql-2.5.3%' then raise exception 'rosetta_v254_expected_v253_finalizer_missing'; end if;
  v_definition:=replace(v_definition,'FUNCTION public.rosetta_v253_finalize_extraction(','FUNCTION public.rosetta_v254_finalize_extraction(');
  v_definition:=replace(v_definition,'rosetta-v3-deterministic-sql-2.5.3','rosetta-v3-deterministic-sql-2.5.4');
  v_definition:=replace(v_definition,'rosetta-five-layer-structural-correctness-2.5.3','rosetta-five-layer-structural-correctness-2.5.4');
  v_definition:=replace(v_definition,'-v253-','-v254-');
  v_definition:=replace(v_definition,'public.rosetta_v253_canonical_output','public.rosetta_v254_canonical_output');
  v_definition:=replace(v_definition,'rosetta-structural-correctness-v253','rosetta-structural-correctness-v254');
  v_definition:=replace(v_definition,'exact_source_structure_v253','exact_source_structure_v254');
  v_definition:=replace(v_definition,'rosetta_v253_canonical_output_unavailable','rosetta_v254_canonical_output_unavailable');
  execute v_definition;
end;
$migration$

create or replace function public.rosetta_v254_reconcile_structural_correctness(p_extraction_run_id integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_base jsonb;
begin
  v_base:=public.rosetta_v253_reconcile_structural_correctness(p_extraction_run_id);
  return v_base||jsonb_build_object('contract','rosetta-structural-reconciliation-v254');
end;
$$

create or replace function public.rosetta_v254_validate_independent_structure(p_extraction_run_id integer,p_source_text text)
returns jsonb language plpgsql stable strict set search_path=pg_catalog,public,extensions as $$
declare v_base jsonb;
begin
  v_base:=public.rosetta_v253_validate_independent_structure(p_extraction_run_id,p_source_text);
  return v_base||jsonb_build_object('contract','rosetta-independent-structural-validation-v254');
end;
$$

with canonical_manifest as (
  select jsonb_build_object(
    'contract','S -> {HELP, WORKFLOW, ACCOUNTABILITY, OVERRIDES, DEFINITIONS}',
    'engine_version','rosetta-v3-deterministic-sql-2.5.4',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.4',
    'inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.3','rule_set_version','rosetta-five-layer-structural-correctness-2.5.3'),
    'change',jsonb_build_object(
      'canonical_output_bootstrap','Pre-publication canonical output is computed from Rosetta operator/history projection, never the fail-closed public handoff view.',
      'rejected_generation_receipt','Post-base structural/finalization failure is preserved as an immutable rejected generation receipt instead of disappearing through transaction rollback.',
      'current_generation_registry','Publication, proof, replay, and downstream target observation are promoted through one engine/rule/manifest/validation registry row.'
    ),
    'source_projection','rosetta-layout-projection-v25',
    'provenance','Rosetta 2.5.4 is a new immutable generation. Earlier 2.5.x receipts are preserved.'
  ) manifest_json
), receipt as (
  select manifest_json,encode(digest(convert_to(manifest_json::text,'UTF8'),'sha256'),'hex') manifest_hash from canonical_manifest
)
insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
select 'rosetta-v3-deterministic-sql-2.5.4','rosetta-five-layer-structural-correctness-2.5.4',manifest_hash,manifest_json,false from receipt
on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=false

create or replace function public.run_rosetta_v3_extraction_v254_candidate(
  p_source_document_id integer,p_source_text text,p_expected_source_content_hash text,
  p_source_url text,p_source_version text,p_media_type text default 'text/plain',
  p_source_byte_hash text default null,p_source_provider_hash text default null,
  p_reference_date date default null,p_text_extractor_version text default 'plain-text-1',
  p_source_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set statement_timeout='120s' set search_path=pg_catalog,public,extensions as $$
declare
  v_receipt jsonb; v_run_id integer; v_reconciliation jsonb; v_span_receipt jsonb; v_span_repairs jsonb;
  v_validation jsonb; v_output jsonb; v_output_hash text; v_pass boolean; v_manifest_hash text;
  v_error text;
begin
  select manifest_hash into v_manifest_hash from public.extraction_rule_manifest where engine_version='rosetta-v3-deterministic-sql-2.5.4' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.4' limit 1;
  v_receipt:=public.run_rosetta_v3_extraction_v254_base(p_source_document_id,p_source_text,p_expected_source_content_hash,p_source_url,p_source_version,p_media_type,p_source_byte_hash,p_source_provider_hash,p_reference_date,p_text_extractor_version,p_source_metadata);
  if coalesce(v_receipt->>'run_status','')<>'completed' or coalesce(v_receipt->>'admissibility_state','')<>'admissible' then return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;
  v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer; if v_run_id is null then return v_receipt||jsonb_build_object('rule_manifest_hash',v_manifest_hash); end if;
  begin
    v_receipt:=public.rosetta_v254_finalize_extraction(v_run_id,p_source_text,coalesce(p_source_metadata,'{}'::jsonb),v_receipt);
    v_reconciliation:=public.rosetta_v254_reconcile_structural_correctness(v_run_id);
    v_span_receipt:=public.rosetta_v25_refresh_object_source_spans(v_run_id,p_source_text);
    v_span_repairs:=public.rosetta_v25_register_span_repairs(v_run_id);
    v_validation:=public.rosetta_v254_validate_independent_structure(v_run_id,p_source_text);
    v_pass:=coalesce(v_validation->>'status','fail')='pass';
  exception when others then
    v_error:=left(sqlerrm,240);
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v254_post_base_failure',completed_at=clock_timestamp() where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('rosetta_v254_post_base_failure',jsonb_build_object('message',v_error)) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.4','rule_set_version','rosetta-five-layer-structural-correctness-2.5.4','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v254_post_base_failure');
  end;

  insert into public.validation_result(id,extraction_run_id,test_name,test_result,failure_count,details)
  values('vr-v254-'||(select source_identity_hash from public.extraction_run where id=v_run_id)||'-'||(select configuration_hash from public.extraction_run where id=v_run_id)||'-independent-structure',v_run_id,'independent_structure_v254',case when v_pass then 'pass' else 'fail' end,case when v_pass then 0 else 1 end,v_validation)
  on conflict(extraction_run_id,test_name) do update set test_result=excluded.test_result,failure_count=excluded.failure_count,details=excluded.details,executed_at=now();

  if not v_pass then
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v254_independent_structural_validation_failed',completed_at=coalesce(completed_at,clock_timestamp()) where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reconciliation_v254',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'independent_structure_v254',v_validation) where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.4','rule_set_version','rosetta-five-layer-structural-correctness-2.5.4','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v254_independent_structural_validation_failed','independent_structure_v254',v_validation);
  end if;

  update public.extraction_run set run_status='completed',admissibility_state='admissible',failure_code=null,completed_at=coalesce(completed_at,clock_timestamp()) where id=v_run_id;
  update public.extraction_manifest set status='clean',admissibility_state='admissible',validation_results=coalesce(validation_results,'{}'::jsonb)||jsonb_build_object('structural_reconciliation_v254',v_reconciliation,'object_source_spans_v25',v_span_receipt,'span_repair_registration_v25',v_span_repairs,'independent_structure_v254',v_validation) where extraction_run_id=v_run_id;
  v_output:=public.rosetta_v254_canonical_output(v_run_id);
  if v_output is null then
    update public.extraction_run set run_status='failed',admissibility_state='rejected',failure_code='rosetta_v254_internal_canonical_output_unavailable' where id=v_run_id;
    update public.extraction_manifest set status='failed',admissibility_state='rejected' where extraction_run_id=v_run_id;
    return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.4','rule_set_version','rosetta-five-layer-structural-correctness-2.5.4','rule_manifest_hash',v_manifest_hash,'run_status','failed','admissibility_state','rejected','failure_code','rosetta_v254_internal_canonical_output_unavailable');
  end if;
  v_output_hash:=encode(digest(convert_to(v_output::text,'UTF8'),'sha256'),'hex');
  update public.extraction_run set output_content_hash=v_output_hash where id=v_run_id;
  update public.extraction_manifest set output_hash=v_output_hash where extraction_run_id=v_run_id;
  update public.validation_result set test_result='pass',failure_count=0,details=jsonb_build_object('output_content_hash',v_output_hash),executed_at=now() where extraction_run_id=v_run_id and test_name='output_hash_verified';
  return v_receipt||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.4','rule_set_version','rosetta-five-layer-structural-correctness-2.5.4','rule_manifest_hash',v_manifest_hash,'run_status','completed','admissibility_state','admissible','failure_code',null,'output_content_hash',v_output_hash,'structural_reconciliation',v_reconciliation,'object_source_spans',v_span_receipt,'independent_structure_v254',v_validation);
end;
$$

revoke all on function public.rosetta_v254_canonical_output(integer) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v254_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v254_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v254_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v254_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v254_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is 'Staged Rosetta 2.5.4 candidate. Computes pre-publication canonical output from the operator/history projection, preserves rejected post-base generations, and does not change the current-generation registry or canonical producer.'
