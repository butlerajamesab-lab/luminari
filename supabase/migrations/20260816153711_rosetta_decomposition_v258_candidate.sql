begin

do $clone$
declare
  v_definition text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.rosetta_v257_clean_amendment_operation_text(text)',
    'public.rosetta_v257_amendment_operations(text)',
    'public.rosetta_v257_canonical_output(integer)',
    'public.rosetta_v257_finalize_extraction(integer,text,jsonb,jsonb)',
    'public.rosetta_v257_reclassify_amendment_structure(integer,text,jsonb)',
    'public.rosetta_v257_reconcile_structural_correctness(integer)',
    'public.rosetta_v257_final_coverage(integer)',
    'public.rosetta_v257_refresh_final_coverage_receipts(integer)',
    'public.rosetta_v257_validate_independent_structure(integer,text)',
    'public.run_rosetta_v3_extraction_v257_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v257_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if v_definition is null then
      raise exception 'rosetta_v258_clone_source_missing:%', v_signature;
    end if;
    v_definition := replace(v_definition, 'v257', 'v258');
    v_definition := replace(v_definition, '2.5.7', '2.5.8');
    execute v_definition;
  end loop;
end;
$clone$

do $manifest$
declare
  v_prior jsonb;
  v_manifest jsonb;
  v_hash text;
begin
  select manifest_json into v_prior
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.7'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.7';
  if v_prior is null then raise exception 'rosetta_v258_prior_manifest_missing'; end if;

  v_manifest := v_prior
    || jsonb_build_object(
      'engine_version','rosetta-v3-deterministic-sql-2.5.8',
      'rule_set_version','rosetta-five-layer-structural-correctness-2.5.8',
      'inherits',jsonb_build_object(
        'engine_version','rosetta-v3-deterministic-sql-2.5.7',
        'rule_set_version','rosetta-five-layer-structural-correctness-2.5.7',
        'status','semantic_contract_valid_replay_mutability_diagnostic'
      ),
      'provenance','Rosetta 2.5.8 is a new immutable staged generation. 2.5.7 remains preserved diagnostic history.'
    )
    || jsonb_build_object(
      'change',coalesce(v_prior->'change','{}'::jsonb)||jsonb_build_object(
        'exact_replay_immutability','An already-finalized exact generation returns its stored final receipt without re-finalization, timestamp refresh, canonical-row mutation, or hash mutation. Interrupted base-stage generations complete finalization exactly once.'
      )
    );
  v_hash := encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');

  insert into public.extraction_rule_manifest(
    engine_version,rule_set_version,manifest_hash,manifest_json,is_active
  ) values (
    'rosetta-v3-deterministic-sql-2.5.8',
    'rosetta-five-layer-structural-correctness-2.5.8',
    v_hash,v_manifest,true
  )
  on conflict(engine_version,rule_set_version) do update set
    manifest_hash=excluded.manifest_hash,
    manifest_json=excluded.manifest_json,
    is_active=true;
end;
$manifest$

create or replace function public.run_rosetta_v3_extraction_v258_candidate(
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
set statement_timeout='120s'
set search_path=pg_catalog,public,extensions
as $$
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
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.8'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.8'
    and is_active=true;
  if v_manifest_hash is null then raise exception 'rosetta_v258_active_manifest_missing'; end if;

  v_base:=public.run_rosetta_v3_extraction_v258_base(
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
    from public.extraction_run run
    join public.extraction_manifest manifest on manifest.extraction_run_id=run.id
    join public.validation_result independent on independent.extraction_run_id=run.id
      and independent.test_name='independent_structure_v258'
      and independent.test_result='pass'
      and independent.failure_count=0
    join public.validation_result output_hash on output_hash.extraction_run_id=run.id
      and output_hash.test_name='output_hash_verified'
      and output_hash.test_result='pass'
      and output_hash.failure_count=0
    where run.id=v_run_id
      and run.engine_version='rosetta-v3-deterministic-sql-2.5.8'
      and run.rule_set_version='rosetta-five-layer-structural-correctness-2.5.8'
      and run.rule_manifest_hash=v_manifest_hash
      and run.run_status='completed'
      and run.admissibility_state='admissible'
      and run.output_content_hash is not null
      and manifest.status='clean'
      and manifest.admissibility_state='admissible'
      and manifest.output_hash=run.output_content_hash
  ) into v_finalized;

  if not v_finalized then
    v_receipt:=public.run_rosetta_v3_extraction_v258_candidate_base(
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
      'replay_contract','rosetta-finalized-generation-immutable-replay-v258'
    );
  end if;

  select manifest.row_counts into v_row_counts
  from public.extraction_manifest manifest
  where manifest.extraction_run_id=v_run_id;
  v_coverage:=public.rosetta_v258_final_coverage(v_run_id);
  select coalesce(law.objects,'[]'::jsonb),coalesce(law.structural_representations,'[]'::jsonb)
    into v_objects,v_structural
  from public.v_rosetta_operator_law_view_v1 law
  where law.extraction_run_id=v_run_id;
  select details into v_independent
  from public.validation_result
  where extraction_run_id=v_run_id and test_name='independent_structure_v258';

  return v_receipt||jsonb_build_object(
    'engine_version','rosetta-v3-deterministic-sql-2.5.8',
    'rule_set_version','rosetta-five-layer-structural-correctness-2.5.8',
    'rule_manifest_hash',v_manifest_hash,
    'handoff_contract_version','rosetta-civic-genome-handoff-v2',
    'coverage',coalesce(v_coverage,'{}'::jsonb),
    'row_counts',coalesce(v_row_counts,'{}'::jsonb),
    'objects',coalesce(v_objects,'[]'::jsonb),
    'structural_representations',coalesce(v_structural,'[]'::jsonb),
    'independent_structure_v258',v_independent
  );
end;
$$

revoke all on function public.rosetta_v258_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v258_amendment_operations(text) from public,anon,authenticated

revoke all on function public.rosetta_v258_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v258_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v258_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v258_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v258_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v258_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.rosetta_v258_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v258_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v258_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v258_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v258_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v258_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged Rosetta 2.5.8 candidate. Preserves 2.5.7 structural semantics and makes exact finalized replay immutable; interrupted base-stage generations finalize once. Does not change the current-generation registry.'

commit
