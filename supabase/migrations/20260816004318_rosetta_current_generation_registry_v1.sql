create table if not exists public.rosetta_current_generation_registry_v1 (
  singleton boolean primary key default true check (singleton),
  contract text not null default 'rosetta-current-generation-v1',
  engine_version text not null,
  rule_set_version text not null,
  rule_manifest_hash text not null check (rule_manifest_hash ~ '^[0-9a-f]{64}$'),
  validation_test_name text not null,
  promoted_at timestamptz not null default now()
)

alter table public.rosetta_current_generation_registry_v1 enable row level security

revoke all on public.rosetta_current_generation_registry_v1 from public,anon,authenticated

grant select,insert,update on public.rosetta_current_generation_registry_v1 to service_role

insert into public.rosetta_current_generation_registry_v1(singleton,contract,engine_version,rule_set_version,rule_manifest_hash,validation_test_name,promoted_at)
values(true,'rosetta-current-generation-v1','rosetta-v3-deterministic-sql-2.5.3','rosetta-five-layer-structural-correctness-2.5.3','763abfa9a311610d0e357a9a6c20e66c796c942b55f2bda12b22420f24db3905','independent_structure_v253',now())
on conflict(singleton) do update set contract=excluded.contract,engine_version=excluded.engine_version,rule_set_version=excluded.rule_set_version,rule_manifest_hash=excluded.rule_manifest_hash,validation_test_name=excluded.validation_test_name,promoted_at=excluded.promoted_at

create or replace function public.rosetta_current_generation_v1() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contract',target.contract,'engine_version',target.engine_version,'rule_set_version',target.rule_set_version,'rule_manifest_hash',target.rule_manifest_hash,'validation_test_name',target.validation_test_name,'promoted_at',target.promoted_at) from public.rosetta_current_generation_registry_v1 target where target.singleton=true;
$$

revoke all on function public.rosetta_current_generation_v1() from public,anon,authenticated

grant execute on function public.rosetta_current_generation_v1() to service_role

create or replace function public.rosetta_is_current_publishable_run_v1(p_extraction_run_id integer) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(
   select 1 from public.extraction_run run cross join public.rosetta_current_generation_registry_v1 target
   where target.singleton=true and run.id=p_extraction_run_id
     and run.run_status in ('completed','validated') and run.admissibility_state='admissible'
     and run.engine_version=target.engine_version and run.rule_set_version=target.rule_set_version and run.rule_manifest_hash=target.rule_manifest_hash
     and exists(select 1 from public.validation_result validation where validation.extraction_run_id=run.id and validation.test_name=target.validation_test_name and validation.test_result='pass' and validation.failure_count=0)
     and public.rosetta_blocking_structural_repair_count(run.id)=0
     and not exists(
       select 1 from public.extraction_run newer
       where newer.source_document_id=run.source_document_id and newer.id>run.id
         and newer.run_status in ('completed','validated') and newer.admissibility_state='admissible'
         and newer.engine_version=target.engine_version and newer.rule_set_version=target.rule_set_version and newer.rule_manifest_hash=target.rule_manifest_hash
         and exists(select 1 from public.validation_result nv where nv.extraction_run_id=newer.id and nv.test_name=target.validation_test_name and nv.test_result='pass' and nv.failure_count=0)
         and public.rosetta_blocking_structural_repair_count(newer.id)=0
     )
 );
$$

revoke all on function public.rosetta_is_current_publishable_run_v1(integer) from public,anon,authenticated

grant execute on function public.rosetta_is_current_publishable_run_v1(integer) to service_role

create or replace function rosetta_private.rosetta_current_proof_summary_v1() returns jsonb language sql stable security definer set search_path=pg_catalog,public,rosetta_private as $$
 select jsonb_build_object('contract','rosetta-current-proof-summary-v1','production_run_count',count(*) filter(where sd.document_type is distinct from 'test_control'),'control_receipt_count',count(*) filter(where sd.document_type='test_control'))
 from public.extraction_run run join public.source_document sd on sd.id=run.source_document_id
 where rosetta_private.rosetta_is_current_proof_run_v1(run.id);
$$

create or replace function public.rosetta_multi_law_proof_v1(p_limit integer default 100,p_candidate_limit integer default 500) returns jsonb language sql stable security definer set search_path=pg_catalog,public,rosetta_private as $$
 with bounds as (
  select least(greatest(coalesce(p_limit,100),1),100) result_limit,least(greatest(coalesce(p_candidate_limit,500),least(greatest(coalesce(p_limit,100),1),100)),500) candidate_limit
 ), candidate_runs as materialized (
  select er.* from public.extraction_run er cross join bounds b where rosetta_private.rosetta_is_current_proof_run_v1(er.id) order by er.id desc limit (select candidate_limit from bounds)
 ), proof_rows as (
  select cr.id extraction_run_id,cr.source_document_id,sd.corpus_id,sd.document_name,sd.document_type,sd.document_identifier,cr.run_version,cr.run_status,cr.completed_at,
    coalesce(cov.coverage_json,'{}'::jsonb) coverage,'complete'::text provenance_state,cr.engine_version,cr.rule_set_version,cr.rule_manifest_hash,cr.configuration_hash,cr.source_identity_hash,cr.source_content_hash,cr.output_content_hash,cr.admissibility_state,
    sdc.source_url,sdc.source_version,sdc.media_type,sdc.source_byte_hash,coalesce(obj.object_count,0) object_count,true five_layer_terminal
  from candidate_runs cr join public.source_document sd on sd.id=cr.source_document_id left join public.source_document_content sdc on sdc.source_content_id=cr.source_content_id
  left join lateral (
   select jsonb_object_agg(lower(layer.layer_name),jsonb_build_object('status',layer.coverage_status,'reason',layer.reason,'validated_at',layer.validated_at) order by layer.layer_name) coverage_json
   from (select lc.layer_name,case when bool_or(lc.coverage_status='extraction_failed') then 'extraction_failed' when bool_or(lc.coverage_status='pending_extraction') then 'pending_extraction' when bool_or(lc.coverage_status='populated') then 'populated' else 'not_applicable' end coverage_status,string_agg(distinct lc.reason,' | ' order by lc.reason) filter(where lc.reason is not null) reason,max(lc.validated_at) validated_at from public.layer_coverage lc where lc.extraction_run_id=cr.id group by lc.layer_name) layer
  ) cov on true
  left join lateral (select (select count(*) from public.help_entity h where h.extraction_run_id=cr.id)+(select count(*) from public.workflow_pipeline w where w.extraction_run_id=cr.id)+(select count(*) from public.accountability_route a where a.extraction_run_id=cr.id)+(select count(*) from public.entity_override o where o.extraction_run_id=cr.id)+(select count(*) from public.term_definition d where d.extraction_run_id=cr.id) object_count) obj on true
  order by cr.id desc limit (select result_limit from bounds)
 ) select coalesce(jsonb_agg(to_jsonb(proof_rows) order by extraction_run_id desc),'[]'::jsonb) from proof_rows;
$$

revoke all on function public.rosetta_multi_law_proof_v1(integer,integer) from public

grant execute on function public.rosetta_multi_law_proof_v1(integer,integer) to anon,authenticated,service_role

create or replace function public.rosetta_replay_source_identity_current_v1(p_source_document_id integer,p_source_identity_hash text) returns jsonb language plpgsql security definer set statement_timeout='120s' set search_path=pg_catalog,public,extensions as $$
declare v_content public.source_document_content%rowtype; v_prior public.extraction_run%rowtype; v_reference date; v_extractor text; v_receipt jsonb; v_current jsonb; v_law record; v_run_id integer;
begin
 if p_source_document_id is null or p_source_document_id<=0 then raise exception using errcode='22023',message='rosetta_replay_source_document_id_invalid'; end if;
 if p_source_identity_hash is null or p_source_identity_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='rosetta_replay_source_identity_hash_invalid'; end if;
 select * into v_content from public.source_document_content where source_document_id=p_source_document_id and source_identity_hash=p_source_identity_hash order by created_at desc limit 1;
 if not found then raise exception using errcode='P0002',message='rosetta_replay_source_identity_not_found'; end if;
 select * into v_prior from public.extraction_run where source_document_id=p_source_document_id and source_content_id=v_content.source_content_id and configuration_json is not null order by id desc limit 1;
 if not found then raise exception using errcode='P0002',message='rosetta_replay_prior_configuration_not_found'; end if;
 begin v_reference:=nullif(v_prior.configuration_json->>'reference_date','')::date; exception when others then raise exception using errcode='22000',message='rosetta_replay_reference_date_invalid'; end;
 v_extractor:=coalesce(nullif(v_prior.configuration_json->>'text_extractor_version',''),'unknown'); v_current:=public.rosetta_current_generation_v1(); if v_current is null then raise exception using errcode='55000',message='rosetta_current_generation_unavailable'; end if;
 v_receipt:=public.run_rosetta_v3_extraction(p_source_document_id,v_content.source_text,v_content.source_content_hash,v_content.source_url,v_content.source_version,v_content.media_type,v_content.source_byte_hash,v_content.source_provider_hash,v_reference,v_extractor,coalesce(v_content.source_metadata,'{}'::jsonb));
 if coalesce(v_receipt->>'engine_version','')<>coalesce(v_current->>'engine_version','') or coalesce(v_receipt->>'rule_set_version','')<>coalesce(v_current->>'rule_set_version','') or coalesce(v_receipt->>'rule_manifest_hash','')<>coalesce(v_current->>'rule_manifest_hash','') then raise exception using errcode='22000',message='rosetta_replay_generation_mismatch',detail=jsonb_build_object('current',v_current,'receipt',v_receipt)::text; end if;
 v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer; if v_run_id is not null then select * into v_law from public.v_civic_genome_law_view_v1 where extraction_run_id=v_run_id limit 1; end if;
 return v_receipt || case when v_law.extraction_run_id is null then '{}'::jsonb else jsonb_build_object('coverage',v_law.coverage,'provenance_state',v_law.provenance_state,'published_object_count',jsonb_array_length(v_law.objects),'output_content_hash',v_law.output_content_hash) end || jsonb_build_object('replay_contract','rosetta-exact-source-current-generation-replay-v1','requested_source_document_id',p_source_document_id,'requested_source_identity_hash',p_source_identity_hash,'current_generation',v_current);
end;
$$

revoke all on function public.rosetta_replay_source_identity_current_v1(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_replay_source_identity_current_v1(integer,text) to service_role
