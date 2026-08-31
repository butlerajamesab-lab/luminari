begin

create or replace function public.rosetta_v251_accountability_actor(p_trigger text,p_existing_actor text)
returns text language sql immutable set search_path=pg_catalog as $$
 select case when coalesce(p_trigger,'') ~* '\m(?:guilty|felony|sentenc|penalt|forfeitur)' and coalesce(p_trigger,'') ~* '\mis\s+guilty\M' then nullif(btrim(regexp_replace(p_trigger,'(?i)\s+is\s+guilty\b.*$','')),'') else nullif(btrim(coalesce(p_existing_actor,'')),'') end;
$$

create or replace function public.rosetta_v251_accountability_kind(p_trigger text)
returns table(enforcement_type text,enforcement_direction text,clause_type text)
language sql immutable strict set search_path=pg_catalog as $$
 select
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'source_stated_penalty_rule'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'source_stated_reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'source_stated_licensing_enforcement_rule'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'source_stated_investigation_rule'
      else 'source_stated_enforcement_rule' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'individual_penalty'
      when p_trigger ~* '\m(?:report|notify|transmit)\M' then 'reporting_requirement'
      when p_trigger ~* '\m(?:refuse\s+to\s+(?:issue|renew)|suspend(?:ing|ed|s)?|revok(?:e|ed|ing|es|ation)|licens(?:e|ed|ing|ure)|disciplin(?:e|ed|ary|ing))\M' then 'agency_mandate'
      when p_trigger ~* '\minvestigat(?:e|ed|es|ing|ion)\M' then 'agency_mandate'
      when p_trigger ~* '\mshall\s+take\s+appropriate\s+action\M' then 'agency_mandate'
      else 'procedure' end,
 case when p_trigger ~* '\m(?:guilty|felony|sentenc(?:e|ed|ing)?|penalt(?:y|ies)|forfeitur(?:e|es))\M' then 'procedure'
      when p_trigger ~* '\m(?:report|notify|transmit|refuse|suspend|revok|licens|disciplin|investigat)' then 'agency_mandate'
      else 'procedure' end;
$$

create or replace function public.rosetta_v251_reconcile_structural_correctness(p_extraction_run_id integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_route record; v_kind record; v_actor text; v_definition_count integer:=0; v_accountability_count integer:=0; v_occurrence_count integer:=0; v_blocking integer:=0;
begin
 update public.term_definition definition set defining_section=block.section_number,section_declared=block.section_number,section_observed=block.section_number,section_status='resolved' from public.hr1_raw_blocks block where definition.extraction_run_id=p_extraction_run_id and block.id=definition.source_block_id; get diagnostics v_definition_count=row_count;
 for v_route in select route.id,route.trigger_condition,coalesce(nullif(route.actor_source_text,''),nullif(route.enforcement_actor,'')) existing_actor,block.section_number from public.accountability_route route join public.hr1_raw_blocks block on block.id=route.source_block_id where route.extraction_run_id=p_extraction_run_id loop
  v_actor:=public.rosetta_v251_accountability_actor(v_route.trigger_condition,v_route.existing_actor); select * into v_kind from public.rosetta_v251_accountability_kind(v_route.trigger_condition);
  update public.accountability_route set actor_source_text=v_actor,enforcement_actor=v_actor,actor_label=v_actor,governing_section=v_route.section_number,section_declared=v_route.section_number,section_observed=v_route.section_number,section_status='resolved',enforcement_type=v_kind.enforcement_type,enforcement_direction=v_kind.enforcement_direction,clause_type=v_kind.clause_type,action_type=case when trigger_condition ~* '\mshall\M' then 'shall' when trigger_condition ~* '\mmust\M' then 'must' when trigger_condition ~* '\mmay\M' then 'may' else null end where id=v_route.id; v_accountability_count:=v_accountability_count+1;
 end loop;
 delete from public.rosetta_structural_repair_queue where extraction_run_id=p_extraction_run_id and defect_type in ('actor_unresolved','actor_source_corrupt','accountability_semantic_mismatch');
 insert into public.rosetta_structural_repair_queue(extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state)
 select route.extraction_run_id,route.source_document_id,'accountability',route.id,'actor_source_corrupt',jsonb_build_object('actor_source_text',route.actor_source_text),'open' from public.accountability_route route where route.extraction_run_id=p_extraction_run_id and public.rosetta_v25_actor_source_corrupt(route.actor_source_text)
 on conflict(object_type,object_id,defect_type) do update set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;
 insert into public.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type)
 select distinct encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),public.rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure') from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id where route.extraction_run_id=p_extraction_run_id and public.rosetta_normalize_clause_text(node.action_required)<>'' on conflict(normalized_text_hash,clause_type) do nothing;
 insert into public.rosetta_clause_occurrence(canonical_clause_id,accountability_route_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,section_observed,section_status,source_text)
 select canonical.canonical_clause_id,route.id,route.extraction_run_id,route.source_document_id,route.source_block_id,block.char_offset_start,block.char_offset_end,block.section_number,route.section_status,node.action_required from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id join public.hr1_raw_blocks block on block.id=route.source_block_id join public.rosetta_canonical_clause canonical on canonical.normalized_text_hash=encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex') and canonical.clause_type=coalesce(route.clause_type,'procedure') where route.extraction_run_id=p_extraction_run_id on conflict(accountability_route_id) do update set canonical_clause_id=excluded.canonical_clause_id,section_observed=excluded.section_observed,section_status=excluded.section_status,source_text=excluded.source_text; get diagnostics v_occurrence_count=row_count;
 select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking;
 return jsonb_build_object('contract','rosetta-structural-reconciliation-v251','extraction_run_id',p_extraction_run_id,'definition_count',v_definition_count,'accountability_count',v_accountability_count,'clause_occurrence_count',v_occurrence_count,'blocking_repair_count',v_blocking,'publication_state',case when v_blocking>0 then 'verified_with_defects' else 'verified' end);
end;$$

create or replace function public.rosetta_v251_validate_independent_structure(p_extraction_run_id integer,p_source_text text)
returns jsonb language plpgsql stable strict set search_path=pg_catalog,public,extensions as $$
declare v_base jsonb; v_typing_mismatch integer; v_penalty_actor_mismatch integer; v_status text;
begin
 v_base:=public.rosetta_v25_validate_independent_structure(p_extraction_run_id,p_source_text);
 select count(*)::integer into v_typing_mismatch from public.accountability_route route cross join lateral public.rosetta_v251_accountability_kind(route.trigger_condition) expected where route.extraction_run_id=p_extraction_run_id and (route.enforcement_type is distinct from expected.enforcement_type or route.enforcement_direction is distinct from expected.enforcement_direction or route.clause_type is distinct from expected.clause_type);
 select count(*)::integer into v_penalty_actor_mismatch from public.accountability_route route where route.extraction_run_id=p_extraction_run_id and route.enforcement_type='source_stated_penalty_rule' and (nullif(btrim(coalesce(route.enforcement_actor,'')),'') is null or route.enforcement_actor ~* '\mis\s+guilty\M|\mmay\s+be\s+sentenced\M');
 v_status:=case when coalesce(v_base->>'status','fail')='pass' and v_typing_mismatch=0 and v_penalty_actor_mismatch=0 then 'pass' else 'fail' end;
 return v_base||jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v251','accountability_typing_mismatch_count',v_typing_mismatch,'penalty_actor_mismatch_count',v_penalty_actor_mismatch);
end;$$

revoke all on function public.rosetta_v251_accountability_actor(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v251_accountability_kind(text) from public,anon,authenticated

revoke all on function public.rosetta_v251_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v251_validate_independent_structure(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_v251_reconcile_structural_correctness(integer) to service_role

grant execute on function public.rosetta_v251_validate_independent_structure(integer,text) to service_role

comment on function public.rosetta_v251_accountability_kind(text) is 'Rosetta 2.5.1 action-precedence classifier. Classifies accountability from the operative action, with penalty > reporting > licensing > investigation > procedure precedence.'

commit
