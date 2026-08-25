CREATE OR REPLACE FUNCTION public.rosetta_v2511_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
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
  if not found then raise exception 'rosetta_v2511_extraction_run_not_found'; end if;
  if v_run.source_content_id is not null then
    select coalesce(source_metadata,'{}'::jsonb) into v_metadata
    from public.source_document_content where source_content_id=v_run.source_content_id;
  end if;
  v_family:=lower(coalesce(v_metadata->>'docket_document_family',''));

  if v_family<>'amendment' then
    return v_base||jsonb_build_object(
      'contract','rosetta-independent-structural-validation-v2511',
      'document_family',nullif(v_family,'')
    );
  end if;

  v_raw_expected_workflow:=coalesce((v_base->>'expected_workflow_count')::integer,0);
  select count(*)::integer into v_expected from public.rosetta_v2511_amendment_operations(p_source_text);
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
  v_expected_disposition:=public.rosetta_v2511_amendment_disposition(p_source_text,v_metadata);
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
    'contract','rosetta-independent-structural-validation-v2511',
    'document_family','amendment','amendment_format',public.rosetta_v2511_amendment_format(p_source_text),
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
$function$
