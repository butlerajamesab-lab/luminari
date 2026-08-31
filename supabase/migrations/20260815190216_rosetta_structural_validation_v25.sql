begin

create or replace function public.rosetta_v25_actor_source_corrupt(p_actor text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    nullif(btrim(coalesce(p_actor,'')), '') is null
    or coalesce(p_actor,'') ~ '^\s*[0-9]+(?:\s|\.|\))'
    or coalesce(p_actor,'') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--';
$$

create or replace function public.rosetta_v25_reconcile_structural_correctness(p_extraction_run_id integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_definition_count integer := 0;
  v_accountability_count integer := 0;
  v_occurrence_count integer := 0;
  v_open_repair_count integer := 0;
begin
  update public.term_definition definition
     set defining_section = block.section_number,
         section_declared = block.section_number,
         section_observed = block.section_number,
         section_status = 'resolved'
    from public.hr1_raw_blocks block
   where definition.extraction_run_id = p_extraction_run_id
     and block.id = definition.source_block_id;
  get diagnostics v_definition_count = row_count;

  update public.accountability_route route
     set actor_source_text = coalesce(nullif(route.actor_source_text,''), route.enforcement_actor),
         governing_section = block.section_number,
         section_declared = block.section_number,
         section_observed = block.section_number,
         section_status = 'resolved'
    from public.hr1_raw_blocks block
   where route.extraction_run_id = p_extraction_run_id
     and block.id = route.source_block_id;

  update public.accountability_route route
     set action_type = case
           when route.trigger_condition ~* '\mshall\s+not\M' then 'shall'
           when route.trigger_condition ~* '\mmust\s+not\M' then 'must'
           when route.trigger_condition ~* '\mmay\s+not\M' then 'may'
           when route.trigger_condition ~* '\mshall\M' then 'shall'
           when route.trigger_condition ~* '\mmust\M' then 'must'
           when route.trigger_condition ~* '\mmay\M' then 'may'
           else null
         end,
         clause_type = case
           when route.trigger_condition ~* '\m(?:report|notify|transmit|provide)\M' then 'agency_mandate'
           when route.trigger_condition ~* '\minvestigat' then 'agency_mandate'
           when route.trigger_condition ~* '\m(?:felony|sentenc|penalt|forfeitur|guilty)\M' then 'procedure'
           else 'procedure'
         end,
         enforcement_type = case
           when route.trigger_condition ~* '\m(?:report|notify|transmit|provide)\M' then 'source_stated_reporting_requirement'
           when route.trigger_condition ~* '\minvestigat' then 'source_stated_investigation_rule'
           when route.trigger_condition ~* '\m(?:suspend|revok|licens|disciplin)\M' then 'source_stated_licensing_enforcement_rule'
           when route.trigger_condition ~* '\m(?:felony|sentenc|penalt|forfeitur|guilty)\M' then 'source_stated_penalty_rule'
           else route.enforcement_type
         end,
         enforcement_direction = case
           when route.trigger_condition ~* '\m(?:report|notify|transmit|provide)\M' then 'reporting_requirement'
           when route.trigger_condition ~* '\m(?:felony|sentenc|penalt|forfeitur|guilty)\M' then 'individual_penalty'
           when route.trigger_condition ~* '\minvestigat' then 'agency_mandate'
           when route.trigger_condition ~* '\m(?:suspend|revok|licens|disciplin)\M' then 'agency_mandate'
           else 'procedure'
         end,
         enforcement_actor = coalesce(nullif(route.actor_source_text,''), route.enforcement_actor),
         actor_label = coalesce(nullif(route.actor_label,''), nullif(route.actor_source_text,''), route.enforcement_actor)
   where route.extraction_run_id = p_extraction_run_id;
  get diagnostics v_accountability_count = row_count;

  delete from public.rosetta_structural_repair_queue
   where extraction_run_id = p_extraction_run_id
     and defect_type = 'actor_unresolved';

  insert into public.rosetta_structural_repair_queue (
    extraction_run_id, source_document_id, object_type, object_id,
    defect_type, defect_detail, repair_state
  )
  select route.extraction_run_id,route.source_document_id,'accountability',route.id,
         'actor_source_corrupt',jsonb_build_object('actor_source_text',route.actor_source_text),'open'
  from public.accountability_route route
  where route.extraction_run_id = p_extraction_run_id
    and public.rosetta_v25_actor_source_corrupt(route.actor_source_text)
  on conflict (object_type, object_id, defect_type) do update
     set defect_detail = excluded.defect_detail, repair_state='open', resolved_at=null;

  update public.rosetta_structural_repair_queue repair
     set repair_state='resolved',resolved_at=now()
    from public.accountability_route route
   where repair.extraction_run_id=p_extraction_run_id
     and repair.object_type='accountability'
     and repair.object_id=route.id
     and repair.defect_type='actor_source_corrupt'
     and not public.rosetta_v25_actor_source_corrupt(route.actor_source_text)
     and repair.repair_state<>'resolved';

  insert into public.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type)
  select distinct encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),
         public.rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure')
  from public.accountability_route route
  join public.escalation_node node on node.accountability_route_id=route.id
  where route.extraction_run_id=p_extraction_run_id
    and public.rosetta_normalize_clause_text(node.action_required)<>''
  on conflict (normalized_text_hash,clause_type) do nothing;

  insert into public.rosetta_clause_occurrence(
    canonical_clause_id,accountability_route_id,extraction_run_id,source_document_id,source_block_id,
    source_offset_start,source_offset_end,section_observed,section_status,source_text
  )
  select canonical.canonical_clause_id,route.id,route.extraction_run_id,route.source_document_id,route.source_block_id,
         block.char_offset_start,block.char_offset_end,block.section_number,route.section_status,node.action_required
  from public.accountability_route route
  join public.escalation_node node on node.accountability_route_id=route.id
  join public.hr1_raw_blocks block on block.id=route.source_block_id
  join public.rosetta_canonical_clause canonical
    on canonical.normalized_text_hash=encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex')
   and canonical.clause_type=coalesce(route.clause_type,'procedure')
  where route.extraction_run_id=p_extraction_run_id
  on conflict(accountability_route_id) do update
    set canonical_clause_id=excluded.canonical_clause_id,
        section_observed=excluded.section_observed,
        section_status=excluded.section_status,
        source_text=excluded.source_text;
  get diagnostics v_occurrence_count=row_count;

  select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_open_repair_count;
  return jsonb_build_object('contract','rosetta-structural-reconciliation-v25','extraction_run_id',p_extraction_run_id,'definition_count',v_definition_count,'accountability_count',v_accountability_count,'clause_occurrence_count',v_occurrence_count,'blocking_repair_count',v_open_repair_count,'publication_state',case when v_open_repair_count>0 then 'verified_with_defects' else 'verified' end);
end;
$$

create or replace function public.rosetta_v25_register_span_repairs(p_extraction_run_id integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_open integer;
begin
  insert into public.rosetta_structural_repair_queue(
    extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state
  )
  select span.extraction_run_id,span.source_document_id,span.object_type,span.object_id,
         case when span.span_status='ambiguous' then 'source_span_ambiguous' else 'source_span_unresolved' end,
         jsonb_build_object('source_block_id',span.source_block_id,'normalized_text',span.normalized_text,'span_status',span.span_status),'open'
  from public.rosetta_object_source_span span
  where span.extraction_run_id=p_extraction_run_id and span.span_status<>'resolved'
  on conflict(object_type,object_id,defect_type) do update
    set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;

  update public.rosetta_structural_repair_queue repair
     set repair_state='resolved',resolved_at=now()
    from public.rosetta_object_source_span span
   where repair.extraction_run_id=p_extraction_run_id
     and repair.object_type=span.object_type
     and repair.object_id=span.object_id
     and repair.defect_type in ('source_span_ambiguous','source_span_unresolved')
     and span.span_status='resolved'
     and repair.repair_state<>'resolved';
  select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_open;
  return jsonb_build_object('contract','rosetta-span-repair-registration-v25','extraction_run_id',p_extraction_run_id,'blocking_repair_count',v_open);
end;
$$

create or replace function public.rosetta_v25_validate_independent_structure(p_extraction_run_id integer,p_source_text text)
returns jsonb
language plpgsql
stable
strict
set search_path = pg_catalog, public, extensions
as $$
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
$$

revoke all on function public.rosetta_v25_actor_source_corrupt(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v25_register_span_repairs(integer) from public,anon,authenticated

revoke all on function public.rosetta_v25_validate_independent_structure(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_v25_reconcile_structural_correctness(integer) to service_role

grant execute on function public.rosetta_v25_register_span_repairs(integer) to service_role

grant execute on function public.rosetta_v25_validate_independent_structure(integer,text) to service_role

comment on function public.rosetta_v25_validate_independent_structure(integer,text) is 'Independent Rosetta 2.5 stored-object validation. Audits raw block hashes, exact object spans, layout contamination, section fragmentation, override classification, accountability actors, and workflow coverage before publication.'

commit
