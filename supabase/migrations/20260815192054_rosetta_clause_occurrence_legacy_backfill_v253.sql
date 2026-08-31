begin

insert into public.rosetta_canonical_clause(normalized_text_hash,normalized_text,clause_type)
select distinct encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex'),public.rosetta_normalize_clause_text(node.action_required),coalesce(route.clause_type,'procedure') from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id where public.rosetta_normalize_clause_text(node.action_required)<>'' on conflict(normalized_text_hash,clause_type) do nothing

insert into public.rosetta_clause_occurrence(canonical_clause_id,accountability_route_id,escalation_node_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,section_observed,section_status,source_text)
select canonical.canonical_clause_id,route.id,node.id,route.extraction_run_id,route.source_document_id,route.source_block_id,block.char_offset_start,block.char_offset_end,block.section_number,coalesce(route.section_status,'unresolved'),node.action_required from public.accountability_route route join public.escalation_node node on node.accountability_route_id=route.id left join public.hr1_raw_blocks block on block.id=route.source_block_id join public.rosetta_canonical_clause canonical on canonical.normalized_text_hash=encode(digest(convert_to(public.rosetta_normalize_clause_text(node.action_required),'UTF8'),'sha256'),'hex') and canonical.clause_type=coalesce(route.clause_type,'procedure') where not exists(select 1 from public.rosetta_clause_occurrence existing where existing.accountability_route_id=route.id and existing.escalation_node_id=node.id) on conflict(accountability_route_id,escalation_node_id) do nothing

comment on table public.rosetta_clause_occurrence is 'Node-aware accountability occurrence receipts. The 2.5.3 backfill adds missing legacy route/node receipts only; it does not rewrite historical accountability routes or nodes.'

commit
