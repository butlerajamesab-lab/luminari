begin

alter table public.rosetta_clause_occurrence add column if not exists escalation_node_id text

update public.rosetta_clause_occurrence occurrence set escalation_node_id=(select node.id from public.escalation_node node where node.accountability_route_id=occurrence.accountability_route_id and public.rosetta_normalize_clause_text(node.action_required)=public.rosetta_normalize_clause_text(occurrence.source_text) order by node.id limit 1) where occurrence.escalation_node_id is null

do $migration$ declare v_unresolved integer; begin select count(*)::integer into v_unresolved from public.rosetta_clause_occurrence where escalation_node_id is null; if v_unresolved>0 then raise exception 'rosetta_v253_occurrence_node_backfill_failed:%',v_unresolved; end if; end;$migration$

alter table public.rosetta_clause_occurrence alter column escalation_node_id set not null

alter table public.rosetta_clause_occurrence drop constraint if exists rosetta_clause_occurrence_accountability_route_id_key

alter table public.rosetta_clause_occurrence drop constraint if exists rosetta_clause_occurrence_escalation_node_id_fkey

alter table public.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_escalation_node_id_fkey foreign key(escalation_node_id) references public.escalation_node(id) on delete cascade

alter table public.rosetta_clause_occurrence drop constraint if exists rosetta_clause_occurrence_route_node_key

alter table public.rosetta_clause_occurrence add constraint rosetta_clause_occurrence_route_node_key unique(accountability_route_id,escalation_node_id)

create index if not exists rosetta_clause_occurrence_node_idx on public.rosetta_clause_occurrence(escalation_node_id)

create or replace function public.rosetta_v253_reconcile_structural_correctness(p_extraction_run_id integer) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare v_route record; v_kind record; v_actor text; v_definition_count integer:=0; v_accountability_count integer:=0; v_occurrence_count integer:=0; v_blocking integer:=0;
begin
 update public.term_definition definition set defining_section=block.section_number,section_declared=block.section_number,section_observed=block.section_number,section_status='resolved' from public.hr1_raw_blocks block where definition.extraction_run_id=p_extraction_run_id and block.id=definition.source_block_id; get diagnostics v_definition_count=row_count;
 for v_route in select route.id,route.trigger_condition,coalesce(nullif(route.actor_source_text,''),nullif(route.enforcement_actor,'')) existing_actor,block.section_number from public.accountability_route route join public.hr1_raw_blocks block on block.id=route.source_block_id where route.extraction_run_id=p_extraction_run_id loop
  v_actor:=public.rosetta_v251_accountability_actor(v_route.trigger_condition,v_route.existing_actor); select * into v_kind from public.rosetta_v251_accountability_kind(v_route.trigger_condition); if v_kind.enforcement_type='source_stated_penalty_rule' and v_route.trigger_condition ~* '\mis\s+guilty\M' then v_actor:=public.rosetta_v252_penalty_actor(v_route.trigger_condition); end if;
  update public.accountability_route set actor_source_text=v_actor,enforcement_actor=v_actor,actor_label=v_actor,governing_section=v_route.section_number,section_declared=v_route.section_number,section_observed=v_route.section_number,section_status='resolved',enforcement_type=v_kind.enforcement_type,enforcement_direction=v_kind.enforcement_direction,clause_type=v_kind.clause_type,action_type=case when trigger_condition ~* '\mshall\M' then 'shall' when trigger_condition ~* '\mmust\M' then 'must' when trigger_condition ~* '\mmay\M' then 'may' else null end where id=v_route.id; v_accountability_count:=v_accountability_count+1;
 end loop;
 delete from public.rosetta_structural_repair_queue where extraction_run_id=p_extraction_run_id and defect_type in ('actor_unresolved','actor_source_corrupt','accountability_semantic_mismatch');
 insert into public.rosetta_structural_repair_queue(extraction_run_id,source_document_id,object_type,object_id,defect_type,defect_detail,repair_state) select route.extraction_run_id,route.source_document_id,'accountability',route.id,'actor_source_corrupt',jsonb_build_object('actor_source_text',route.actor_source_text),'open' from public.accountability_route route where route.extraction_run_id=p_extraction_run_id and public.rosetta_v25_actor_source_corrupt(route.actor_source_text) on conflict(object_type,object_id,defect_type) do update set defect_detail=excluded.defect_detail,repair_state='open',resolved_at=null;
 insert into public.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type) select distinct encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),public.rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure') from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id where route.extraction_run_id=p_extraction_run_id and public.rosetta_normalize_clause_text(node.action_required)<>'' on conflict(normalized_text_hash,clause_type) do nothing;
 insert into public.rosetta_clause_occurrence(canonical_clause_id,accountability_route_id,escalation_node_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,section_observed,section_status,source_text) select canonical.canonical_clause_id,route.id,node.id,route.extraction_run_id,route.source_document_id,route.source_block_id,block.char_offset_start,block.char_offset_end,block.section_number,route.section_status,node.action_required from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id join public.hr1_raw_blocks block on block.id=route.source_block_id join public.rosetta_canonical_clause canonical on canonical.normalized_text_hash=encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex') and canonical.clause_type=coalesce(route.clause_type,'procedure') where route.extraction_run_id=p_extraction_run_id on conflict(accountability_route_id,escalation_node_id) do update set canonical_clause_id=excluded.canonical_clause_id,section_observed=excluded.section_observed,section_status=excluded.section_status,source_text=excluded.source_text; get diagnostics v_occurrence_count=row_count;
 select public.rosetta_blocking_structural_repair_count(p_extraction_run_id) into v_blocking; return jsonb_build_object('contract','rosetta-structural-reconciliation-v253','extraction_run_id',p_extraction_run_id,'definition_count',v_definition_count,'accountability_count',v_accountability_count,'clause_occurrence_count',v_occurrence_count,'blocking_repair_count',v_blocking,'publication_state',case when v_blocking>0 then 'verified_with_defects' else 'verified' end);
end;$$

create or replace function public.rosetta_v253_validate_independent_structure(p_extraction_run_id integer,p_source_text text) returns jsonb language plpgsql stable strict set search_path=pg_catalog,public,extensions as $$
declare v_base jsonb; v_expected integer; v_actual integer; v_binding_mismatch integer; v_status text;
begin v_base:=public.rosetta_v252_validate_independent_structure(p_extraction_run_id,p_source_text); select count(*)::integer into v_expected from public.escalation_node node join public.accountability_route route on route.id=node.accountability_route_id where route.extraction_run_id=p_extraction_run_id; select count(*)::integer into v_actual from public.rosetta_clause_occurrence occurrence where occurrence.extraction_run_id=p_extraction_run_id; select count(*)::integer into v_binding_mismatch from public.rosetta_clause_occurrence occurrence join public.escalation_node node on node.id=occurrence.escalation_node_id where occurrence.extraction_run_id=p_extraction_run_id and (node.accountability_route_id is distinct from occurrence.accountability_route_id or public.rosetta_normalize_clause_text(node.action_required) is distinct from public.rosetta_normalize_clause_text(occurrence.source_text)); v_status:=case when coalesce(v_base->>'status','fail')='pass' and v_expected=v_actual and v_binding_mismatch=0 then 'pass' else 'fail' end; return v_base||jsonb_build_object('status',v_status,'contract','rosetta-independent-structural-validation-v253','expected_clause_occurrence_count',v_expected,'actual_clause_occurrence_count',v_actual,'clause_occurrence_binding_mismatch_count',v_binding_mismatch); end;$$

revoke all on function public.rosetta_v253_reconcile_structural_correctness(integer) from public,anon,authenticated

revoke all on function public.rosetta_v253_validate_independent_structure(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_v253_reconcile_structural_correctness(integer) to service_role

grant execute on function public.rosetta_v253_validate_independent_structure(integer,text) to service_role

comment on table public.rosetta_clause_occurrence is 'One exact source occurrence per accountability route/escalation-node pair. Multi-node accountability routes are first-class and cannot collapse into a route-level uniqueness key.'

commit
