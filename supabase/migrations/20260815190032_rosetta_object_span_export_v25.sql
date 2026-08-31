begin

create or replace function public.rosetta_v25_span_json(p_object_type text,p_object_id text,p_existing jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select case when span.object_id is null or span.span_status<>'resolved' then coalesce(p_existing,'{}'::jsonb)
 else coalesce(p_existing,'{}'::jsonb)||jsonb_build_object('char_offset_start',span.source_offset_start,'char_offset_end',span.source_offset_end,'raw_text_hash',span.raw_text_hash,'projection_version',span.projection_version,'span_status',span.span_status) end
 from (select 1) anchor left join public.rosetta_object_source_span span on span.object_type=p_object_type and span.object_id=p_object_id;
$$

create or replace function public.rosetta_v25_enrich_objects_with_spans(p_extraction_run_id integer,p_objects jsonb)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_object jsonb; v_type text; v_id text; v_metadata jsonb; v_span jsonb; v_steps jsonb; v_step jsonb; v_step_span jsonb; v_new_steps jsonb; v_result jsonb:='[]'::jsonb;
begin
 for v_object in select value from jsonb_array_elements(coalesce(p_objects,'[]'::jsonb)) loop
  v_type:=v_object->>'source_object_type'; v_id:=v_object->>'source_object_id';
  if v_type in ('accountability_route','entity_override','term_definition') then
   v_metadata:=coalesce(v_object->'metadata','{}'::jsonb);
   v_span:=public.rosetta_v25_span_json(v_type,v_id,coalesce(v_metadata->'source_span','{}'::jsonb));
   v_metadata:=jsonb_set(v_metadata,'{source_span}',v_span,true); v_object:=jsonb_set(v_object,'{metadata}',v_metadata,true);
  elsif v_type='workflow_pipeline' then
   v_steps:=coalesce(v_object#>'{normalized_value,steps}','[]'::jsonb); v_new_steps:='[]'::jsonb;
   for v_step in select value from jsonb_array_elements(v_steps) loop
    v_step_span:=public.rosetta_v25_span_json('workflow_step',v_step->>'step_id','{}'::jsonb);
    if coalesce(v_step_span->>'span_status','')='resolved' then v_step:=v_step||jsonb_build_object('source_span',v_step_span); end if;
    v_new_steps:=v_new_steps||jsonb_build_array(v_step);
   end loop;
   v_object:=jsonb_set(v_object,'{normalized_value,steps}',v_new_steps,true);
  end if;
  v_result:=v_result||jsonb_build_array(v_object);
 end loop;
 return v_result;
end;$$

create or replace view public.v_civic_genome_law_view_v1 with (security_invoker=true) as
select law.extraction_run_id,law.source_document_id,law.corpus_id,law.document_name,law.document_type,law.document_identifier,law.run_version,law.run_status,law.confidence_threshold,law.created_at,law.completed_at,
case when public.rosetta_blocking_structural_repair_count(law.extraction_run_id)>0 then '[]'::jsonb else public.rosetta_v25_enrich_objects_with_spans(law.extraction_run_id,law.objects) end as objects,
law.coverage,
case when public.rosetta_blocking_structural_repair_count(law.extraction_run_id)>0 then 'partial'::text else law.provenance_state end as provenance_state,
law.engine_version,law.rule_set_version,law.rule_manifest_hash,law.configuration_hash,law.source_identity_hash,law.source_content_hash,law.output_content_hash,law.admissibility_state,law.source_url,law.source_version,law.media_type,law.source_byte_hash,law.source_provider_hash
from public.v_civic_genome_law_view_v1_internal law

grant select on public.v_civic_genome_law_view_v1 to anon,authenticated,service_role

revoke all on function public.rosetta_v25_span_json(text,text,jsonb) from public

revoke all on function public.rosetta_v25_enrich_objects_with_spans(integer,jsonb) from public

grant execute on function public.rosetta_v25_span_json(text,text,jsonb) to anon,authenticated,service_role

grant execute on function public.rosetta_v25_enrich_objects_with_spans(integer,jsonb) to anon,authenticated,service_role

comment on function public.rosetta_v25_enrich_objects_with_spans(integer,jsonb) is 'Read-only Rosetta 2.5 contract enrichment. Injects exact raw-source spans when a resolved span receipt exists; otherwise preserves the stored historical object unchanged.'

commit
