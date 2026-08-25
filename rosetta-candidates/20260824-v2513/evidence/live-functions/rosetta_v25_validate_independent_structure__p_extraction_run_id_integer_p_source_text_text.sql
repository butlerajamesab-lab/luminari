CREATE OR REPLACE FUNCTION public.rosetta_v25_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_duplicate_section_count integer;
  v_block_hash_mismatch_count integer;
  v_workflow_contamination_count integer;
  v_definition_contamination_count integer;
  v_override_false_positive_count integer;
  v_accountability_contamination_count integer;
  v_expected_span_count integer;
  v_actual_span_count integer;
  v_bad_span_count integer;
  v_span_hash_mismatch_count integer;
  v_expected_workflow_count integer;
  v_actual_workflow_count integer;
  v_blocking_repair_count integer;
  v_status text;
begin
  select count(*)::integer into v_duplicate_section_count
  from (select section_number from public.hr1_raw_blocks where extraction_run_id=p_extraction_run_id and block_type='section' group by section_number having count(*)>1) d;

  select count(*)::integer into v_block_hash_mismatch_count
  from public.hr1_raw_blocks block
  where block.extraction_run_id=p_extraction_run_id
    and block.block_type in ('document','section')
    and block.block_content_hash is distinct from encode(digest(convert_to(substr(p_source_text,block.char_offset_start+1,block.char_offset_end-block.char_offset_start),'UTF8'),'sha256'),'hex');

  select count(*)::integer into v_workflow_contamination_count
  from public.workflow_step step join public.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id
  where pipeline.extraction_run_id=p_extraction_run_id
    and (public.rosetta_v25_actor_source_corrupt(step.actor) or step.step_name ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--');

  select count(*)::integer into v_definition_contamination_count
  from public.term_definition definition
  where definition.extraction_run_id=p_extraction_run_id
    and (definition.defined_term ~* 'REVISOR|ENGROSSMENT|Page No'
         or definition.defined_term ~ '(^|\s)[0-9]{1,3}[.][0-9]{1,3}(\s|$)'
         or definition.definition_text ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--');

  select count(*)::integer into v_override_false_positive_count
  from public.entity_override override_row
  where override_row.extraction_run_id=p_extraction_run_id
    and (((override_row.override_scope ~* '\m(?:shall not|must not|may not)\M'
           and override_row.override_scope !~* '\m(?:unless|however|except|notwithstanding|subject to|does not apply|do not apply)\M'
           and override_row.override_scope !~* '\mNothing in .* shall prevent\M'))
         or override_row.override_scope ~* '["“][^"”]{1,160}["”]\s+(?:includes|means|does not include|has the same meaning as)\M');

  select count(*)::integer into v_accountability_contamination_count
  from public.accountability_route route
  where route.extraction_run_id=p_extraction_run_id
    and (public.rosetta_v25_actor_source_corrupt(coalesce(route.actor_source_text,route.enforcement_actor))
         or route.trigger_condition ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
         or lower(btrim(coalesce(route.actor_source_text,route.enforcement_actor,''))) in ('the report','a report'));

  select
    (select count(*) from public.workflow_step step join public.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id where pipeline.extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.accountability_route route where route.extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.entity_override override_row where override_row.extraction_run_id=p_extraction_run_id)
    +(select count(*) from public.term_definition definition where definition.extraction_run_id=p_extraction_run_id)
  into v_expected_span_count;

  select count(*)::integer,count(*) filter(where span_status<>'resolved')::integer
    into v_actual_span_count,v_bad_span_count
  from public.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;

  select count(*)::integer into v_span_hash_mismatch_count
  from public.rosetta_object_source_span span
  where span.extraction_run_id=p_extraction_run_id and span.span_status='resolved'
    and (span.source_offset_start is null or span.source_offset_end is null or span.source_offset_end<=span.source_offset_start
         or span.raw_text_hash is distinct from encode(digest(convert_to(substr(p_source_text,span.source_offset_start+1,span.source_offset_end-span.source_offset_start),'UTF8'),'sha256'),'hex'));

  select count(*)::integer into v_expected_workflow_count from public.rosetta_v25_normative_clauses(p_source_text);
  select count(*)::integer into v_actual_workflow_count from public.workflow_step step join public.workflow_pipeline pipeline on pipeline.id=step.workflow_pipeline_id where pipeline.extraction_run_id=p_extraction_run_id;
  select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking_repair_count;

  v_status:=case when v_duplicate_section_count=0 and v_block_hash_mismatch_count=0 and v_workflow_contamination_count=0 and v_definition_contamination_count=0 and v_override_false_positive_count=0 and v_accountability_contamination_count=0 and v_expected_span_count=v_actual_span_count and v_bad_span_count=0 and v_span_hash_mismatch_count=0 and v_expected_workflow_count=v_actual_workflow_count and v_blocking_repair_count=0 then 'pass' else 'fail' end;

  return jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v25','extraction_run_id',p_extraction_run_id,'duplicate_section_count',v_duplicate_section_count,'block_hash_mismatch_count',v_block_hash_mismatch_count,'workflow_contamination_count',v_workflow_contamination_count,'definition_contamination_count',v_definition_contamination_count,'override_false_positive_count',v_override_false_positive_count,'accountability_contamination_count',v_accountability_contamination_count,'expected_span_count',v_expected_span_count,'actual_span_count',v_actual_span_count,'bad_span_count',v_bad_span_count,'span_hash_mismatch_count',v_span_hash_mismatch_count,'expected_workflow_count',v_expected_workflow_count,'actual_workflow_count',v_actual_workflow_count,'blocking_repair_count',v_blocking_repair_count);
end;
$function$
