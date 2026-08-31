begin

create or replace function public.rosetta_multi_law_proof_v1(p_limit integer default 100,p_candidate_limit integer default 500)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
with bounds as (
 select least(greatest(coalesce(p_limit,100),1),100) result_limit,
        least(greatest(coalesce(p_candidate_limit,500),least(greatest(coalesce(p_limit,100),1),100)),500) candidate_limit
), candidate_runs as materialized (
 select er.id,er.source_document_id,er.source_content_id,er.run_version,er.run_status,er.completed_at,er.engine_version,er.rule_set_version,er.rule_manifest_hash,er.configuration_hash,er.source_identity_hash,er.source_content_hash,er.output_content_hash,er.admissibility_state
 from public.extraction_run er cross join bounds b order by er.id desc limit (select candidate_limit from bounds)
), proof_rows as (
 select cr.id extraction_run_id,cr.source_document_id,sd.corpus_id,sd.document_name,sd.document_type,sd.document_identifier,cr.run_version,cr.run_status,cr.completed_at,coalesce(cov.coverage_json,'{}'::jsonb) coverage,'complete'::text provenance_state,cr.engine_version,cr.rule_set_version,cr.rule_manifest_hash,cr.configuration_hash,cr.source_identity_hash,cr.source_content_hash,cr.output_content_hash,cr.admissibility_state,sdc.source_url,sdc.source_version,sdc.media_type,sdc.source_byte_hash,coalesce(obj.object_count,0) object_count,true five_layer_terminal
 from candidate_runs cr join public.source_document sd on sd.id=cr.source_document_id left join public.source_document_content sdc on sdc.source_content_id=cr.source_content_id
 left join lateral (
  select jsonb_object_agg(lower(layer.layer_name),jsonb_build_object('status',layer.coverage_status,'reason',layer.reason,'validated_at',layer.validated_at) order by layer.layer_name) coverage_json,count(*) layer_count,bool_and(layer.coverage_status in ('populated','not_applicable')) and count(*)=5 terminal
  from (select lc.layer_name,case when bool_or(lc.coverage_status='extraction_failed') then 'extraction_failed' when bool_or(lc.coverage_status='pending_extraction') then 'pending_extraction' when bool_or(lc.coverage_status='populated') then 'populated' else 'not_applicable' end coverage_status,string_agg(distinct lc.reason,' | ' order by lc.reason) filter(where lc.reason is not null) reason,max(lc.validated_at) validated_at from public.layer_coverage lc where lc.extraction_run_id=cr.id group by lc.layer_name) layer
 ) cov on true
 left join lateral (
  select (select count(*) from public.help_entity h where h.extraction_run_id=cr.id)+(select count(*) from public.workflow_pipeline w where w.extraction_run_id=cr.id)+(select count(*) from public.accountability_route a where a.extraction_run_id=cr.id)+(select count(*) from public.entity_override o where o.extraction_run_id=cr.id)+(select count(*) from public.term_definition d where d.extraction_run_id=cr.id) object_count
 ) obj on true
 where cr.run_status in ('completed','validated') and cr.admissibility_state='admissible'
   and cr.engine_version='rosetta-v3-deterministic-sql-2.5.3'
   and cr.rule_set_version='rosetta-five-layer-structural-correctness-2.5.3'
   and cr.rule_manifest_hash is not null and cr.source_content_hash is not null and cr.output_content_hash is not null and cov.terminal
   and exists(select 1 from public.validation_result validation where validation.extraction_run_id=cr.id and validation.test_name='independent_structure_v253' and validation.test_result='pass' and validation.failure_count=0)
   and not exists(select 1 from public.rosetta_structural_repair_queue repair where repair.extraction_run_id=cr.id and repair.repair_state in ('open','in_review') and (repair.defect_type<>'actor_unresolved' or coalesce(repair.defect_detail->>'actor_source_text','') ~ '^\s*[0-9]+(?:\s|\.|\))|REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'))
   and not exists(select 1 from public.extraction_run newer where newer.source_document_id=cr.source_document_id and newer.id>cr.id and newer.engine_version='rosetta-v3-deterministic-sql-2.5.3' and newer.rule_set_version='rosetta-five-layer-structural-correctness-2.5.3')
 order by cr.id desc limit(select result_limit from bounds)
)
select coalesce(jsonb_agg(to_jsonb(proof_rows) order by extraction_run_id desc),'[]'::jsonb) from proof_rows;
$$

revoke all on function public.rosetta_multi_law_proof_v1(integer,integer) from public

grant execute on function public.rosetta_multi_law_proof_v1(integer,integer) to anon,authenticated,service_role

comment on function public.rosetta_multi_law_proof_v1(integer,integer) is 'Rosetta current-generation proof read model. Only latest-per-source 2.5.3 runs that passed independent_structure_v253, have terminal five-layer coverage, and have no blocking structural repairs can enter proof.'

commit
