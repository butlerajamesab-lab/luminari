begin

create or replace function public.rosetta_v259_amendment_disposition(
  p_source_text text,
  p_source_metadata jsonb
)
returns text
language plpgsql
immutable
set search_path=pg_catalog,public
as $$
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
      message='rosetta_v259_amendment_disposition_conflict',
      detail=jsonb_build_object(
        'metadata_disposition',v_metadata_disposition,
        'source_status_line_disposition',v_source_disposition
      )::text;
  end if;

  return coalesce(v_metadata_disposition,v_source_disposition,'unknown');
end;
$$

do $clone$
declare
  v_definition text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.rosetta_v258_clean_amendment_operation_text(text)',
    'public.rosetta_v258_amendment_operations(text)',
    'public.rosetta_v258_canonical_output(integer)',
    'public.rosetta_v258_finalize_extraction(integer,text,jsonb,jsonb)',
    'public.rosetta_v258_reclassify_amendment_structure(integer,text,jsonb)',
    'public.rosetta_v258_reconcile_structural_correctness(integer)',
    'public.rosetta_v258_final_coverage(integer)',
    'public.rosetta_v258_refresh_final_coverage_receipts(integer)',
    'public.run_rosetta_v3_extraction_v258_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v258_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)',
    'public.run_rosetta_v3_extraction_v258_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    if v_definition is null then raise exception 'rosetta_v259_clone_source_missing:%',v_signature; end if;
    v_definition:=replace(v_definition,'v258','v259');
    v_definition:=replace(v_definition,'2.5.8','2.5.9');
    v_definition:=replace(v_definition,'public.rosetta_v24_amendment_disposition','public.rosetta_v259_amendment_disposition');
    v_definition:=replace(v_definition,'public.rosetta_v25_validate_extraction','public.rosetta_v259_validate_extraction');
    execute v_definition;
  end loop;
end;
$clone$

create or replace function public.rosetta_v259_validate_extraction(
  p_extraction_run_id integer,
  p_source_text text
)
returns jsonb
language plpgsql
stable
strict
set search_path=pg_catalog,public,extensions
as $$
declare
  v_base jsonb;
  v_run public.extraction_run%rowtype;
  v_metadata jsonb:='{}'::jsonb;
  v_family text:='';
  v_raw_expected integer:=0;
  v_status text;
begin
  v_base:=public.rosetta_v25_validate_extraction(p_extraction_run_id,p_source_text);
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v259_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from public.source_document_content where source_content_id=v_run.source_content_id;
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
      'engine_contract','rosetta-structural-self-check-v259-amendment-projection-aware',
      'document_family','amendment',
      'raw_source_expected_workflow_count',v_raw_expected,
      'expected_workflow_count',0,
      'missing_workflow_count',0,
      'operative_workflow_expectation','zero_after_nonoperative_amendment_projection'
    );
  end if;

  return v_base||jsonb_build_object(
    'engine_contract','rosetta-structural-self-check-v259',
    'document_family',nullif(v_family,'')
  );
end;
$$

create or replace function public.rosetta_v259_validate_independent_structure(
  p_extraction_run_id integer,
  p_source_text text
)
returns jsonb
language plpgsql
stable
strict
set search_path=pg_catalog,public,extensions
as $$
declare
  v_base jsonb;
  v_run public.extraction_run%rowtype;
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
  v_base:=public.rosetta_v253_validate_independent_structure(p_extraction_run_id,p_source_text);
  select * into v_run from public.extraction_run where id=p_extraction_run_id;
  if not found then raise exception 'rosetta_v259_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));

  if v_family<>'amendment' then
    return v_base||jsonb_build_object(
      'contract','rosetta-independent-structural-validation-v259',
      'document_family',nullif(v_family,'')
    );
  end if;

  v_raw_expected_workflow:=coalesce((v_base->>'expected_workflow_count')::integer,0);
  select count(*)::integer into v_expected from public.rosetta_v259_amendment_operations(p_source_text);
  select count(*)::integer into v_actual from public.rosetta_structural_representation where extraction_run_id=p_extraction_run_id;
  select
    (select count(*) from public.help_entity where extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.workflow_pipeline where extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.accountability_route where extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.entity_override where extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.term_definition where extraction_run_id=p_extraction_run_id)
    into v_operative;
  select count(*)::integer into v_footer
  from public.rosetta_structural_representation
  where extraction_run_id=p_extraction_run_id
    and representation_type='source_stated_amendment_operation'
    and coalesce(representation_json->>'operation_text','') ~* '(--[[:space:]]*[0-9]+[[:space:]]+of[[:space:]]+[0-9]+[[:space:]]*--|Page[[:space:]]+[0-9]+[[:space:]]+of[[:space:]]+[0-9]+)[[:space:]]*$';
  select count(*)::integer into v_span_mismatch
  from public.rosetta_structural_representation representation
  left join public.hr1_raw_blocks block on block.id=representation.source_block_id
  where representation.extraction_run_id=p_extraction_run_id
    and (block.id is null
      or substring(p_source_text from block.char_offset_start+1 for block.char_offset_end-block.char_offset_start) is distinct from representation.representation_json->>'operation_text'
      or block.block_content_hash is distinct from encode(digest(convert_to(coalesce(representation.representation_json->>'operation_text',''),'UTF8'),'sha256'),'hex'));
  select case when count(distinct layer_name)=5 and coalesce(bool_and(coverage_status='not_applicable'),false) then 0 else 1 end
    into v_coverage_mismatch from public.layer_coverage where extraction_run_id=p_extraction_run_id;
  v_expected_disposition:=public.rosetta_v259_amendment_disposition(p_source_text,v_metadata);
  select count(*)::integer into v_disposition_mismatch
  from public.rosetta_structural_representation
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
    'contract','rosetta-independent-structural-validation-v259',
    'document_family','amendment',
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
$$

do $patch$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.run_rosetta_v3_extraction_v259_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure)
    into v_definition;
  v_definition:=replace(v_definition,'public.rosetta_v25_validate_extraction','public.rosetta_v259_validate_extraction');
  v_definition:=replace(v_definition,'public.rosetta_v24_amendment_disposition','public.rosetta_v259_amendment_disposition');
  execute v_definition;
end;
$patch$

do $manifest$
declare
  v_prior jsonb;
  v_manifest jsonb;
  v_hash text;
begin
  select manifest_json into v_prior
  from public.extraction_rule_manifest
  where engine_version='rosetta-v3-deterministic-sql-2.5.8'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.8';
  if v_prior is null then raise exception 'rosetta_v259_prior_manifest_missing'; end if;

  v_manifest:=v_prior
    || jsonb_build_object(
      'engine_version','rosetta-v3-deterministic-sql-2.5.9',
      'rule_set_version','rosetta-five-layer-structural-correctness-2.5.9',
      'inherits',jsonb_build_object(
        'engine_version','rosetta-v3-deterministic-sql-2.5.8',
        'rule_set_version','rosetta-five-layer-structural-correctness-2.5.8',
        'status','replay_safe_structural_handoff_with_raw_amendment_workflow_expectation_bug'
      ),
      'provenance','Rosetta 2.5.9 is a new immutable staged generation. 2.5.8 remains the current published generation until explicit promotion.'
    )
    || jsonb_build_object(
      'change',coalesce(v_prior->'change','{}'::jsonb)||jsonb_build_object(
        'amendment_operative_workflow_expectation','For document_family=amendment, raw amendment-instruction modal clauses are diagnostic only. After the non-operative amendment projection, expected operative workflow is zero and any actual operative workflow fails validation.',
        'amendment_disposition_status_scope','ADOPTED/NOT ADOPTED source disposition is recognized only from standalone status lines. Statutory uses such as regulations adopted by a city are not amendment-status evidence; explicit docket metadata remains independently checked against any standalone source status line.'
      )
    );
  v_hash:=encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active)
  values('rosetta-v3-deterministic-sql-2.5.9','rosetta-five-layer-structural-correctness-2.5.9',v_hash,v_manifest,true)
  on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true;
end;
$manifest$

revoke all on function public.rosetta_v259_amendment_disposition(text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v259_validate_extraction(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v259_validate_independent_structure(integer,text) from public,anon,authenticated

revoke all on function public.rosetta_v259_clean_amendment_operation_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v259_amendment_operations(text) from public,anon,authenticated

revoke all on function public.rosetta_v259_canonical_output(integer) from public,anon,authenticated

revoke all on function public.rosetta_v259_finalize_extraction(integer,text,jsonb,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v259_reclassify_amendment_structure(integer,text,jsonb) from public,anon,authenticated

revoke all on function public.rosetta_v259_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v259_final_coverage(integer) from public,anon,authenticated

revoke all on function public.rosetta_v259_refresh_final_coverage_receipts(integer) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v259_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v259_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.rosetta_v259_amendment_disposition(text,jsonb) is
  'Amendment disposition v2.5.9: docket adoption metadata plus only standalone ADOPTED/NOT ADOPTED source status lines; ordinary statutory uses of adopted are not disposition evidence.'

comment on function public.rosetta_v259_validate_extraction(integer,text) is
  'Amendment-projection-aware structural self-check: amendment instruction text may contain modal language, but expected operative workflow is zero after non-operative projection.'

comment on function public.run_rosetta_v3_extraction_v259_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is
  'Staged Rosetta 2.5.9 candidate. Inherits replay-safe 2.5.8 structural handoff and corrects amendment operative-workflow expectation plus amendment disposition status-line scope. Does not change the current-generation registry.'

commit
