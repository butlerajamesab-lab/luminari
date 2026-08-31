begin

create or replace function public.rosetta_replay_source_identity_current_v1(p_source_document_id integer,p_source_identity_hash text) returns jsonb language plpgsql security definer set statement_timeout='120s' set search_path=pg_catalog,public,extensions as $$
declare v_content public.source_document_content%rowtype; v_prior_run public.extraction_run%rowtype; v_reference_date date; v_extractor_version text; v_receipt jsonb; v_current jsonb; v_law record; v_run_id integer;
begin
 if p_source_document_id is null or p_source_document_id<=0 then raise exception using errcode='22023',message='rosetta_replay_source_document_id_invalid'; end if;
 if p_source_identity_hash is null or p_source_identity_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='rosetta_replay_source_identity_hash_invalid'; end if;
 select * into v_content from public.source_document_content where source_document_id=p_source_document_id and source_identity_hash=p_source_identity_hash order by created_at desc limit 1; if not found then raise exception using errcode='P0002',message='rosetta_replay_source_identity_not_found'; end if;
 select * into v_prior_run from public.extraction_run where source_document_id=p_source_document_id and source_content_id=v_content.source_content_id and configuration_json is not null order by id desc limit 1; if not found then raise exception using errcode='P0002',message='rosetta_replay_prior_configuration_not_found'; end if;
 begin v_reference_date:=nullif(v_prior_run.configuration_json->>'reference_date','')::date; exception when others then raise exception using errcode='22000',message='rosetta_replay_reference_date_invalid'; end;
 v_extractor_version:=coalesce(nullif(v_prior_run.configuration_json->>'text_extractor_version',''),'unknown');
 v_current:=public.rosetta_current_generation_v1(); if v_current is null then raise exception using errcode='55000',message='rosetta_current_generation_unavailable'; end if;
 v_receipt:=public.run_rosetta_v3_extraction(p_source_document_id,v_content.source_text,v_content.source_content_hash,v_content.source_url,v_content.source_version,v_content.media_type,v_content.source_byte_hash,v_content.source_provider_hash,v_reference_date,v_extractor_version,coalesce(v_content.source_metadata,'{}'::jsonb));
 if coalesce(v_receipt->>'engine_version','')<>coalesce(v_current->>'engine_version','') or coalesce(v_receipt->>'rule_set_version','')<>coalesce(v_current->>'rule_set_version','') then raise exception using errcode='22000',message='rosetta_replay_generation_mismatch',detail=jsonb_build_object('current',v_current,'receipt',v_receipt)::text; end if;
 v_run_id:=nullif(v_receipt->>'extraction_run_id','')::integer; if v_run_id is not null then select * into v_law from public.v_civic_genome_law_view_v1 where extraction_run_id=v_run_id limit 1; end if;
 return v_receipt || case when v_law.extraction_run_id is null then '{}'::jsonb else jsonb_build_object('coverage',v_law.coverage,'provenance_state',v_law.provenance_state,'published_object_count',jsonb_array_length(v_law.objects),'output_content_hash',v_law.output_content_hash) end || jsonb_build_object('replay_contract','rosetta-exact-source-current-generation-replay-v1','requested_source_document_id',p_source_document_id,'requested_source_identity_hash',p_source_identity_hash,'current_generation',v_current);
end;$$

revoke all on function public.rosetta_replay_source_identity_current_v1(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_replay_source_identity_current_v1(integer,text) to service_role

commit
