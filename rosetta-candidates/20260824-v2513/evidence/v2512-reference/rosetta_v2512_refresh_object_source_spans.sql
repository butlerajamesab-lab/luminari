CREATE OR REPLACE FUNCTION public.rosetta_v2512_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
 v_row record; v_loc record; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text; v_source_count integer; v_object_count integer; v_object_ordinal integer; v_definition_only boolean; v_status text;
begin
 delete from public.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;
 for v_row in
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join public.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id
  union all select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from public.accountability_route ar join public.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id
  union all select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from public.entity_override eo join public.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id
  union all select 'term_definition',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,'"'||td.defined_term||'" '||td.definition_text from public.term_definition td join public.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id
  order by object_type,source_block_id,needle,object_id
 loop
  v_needle:=v_row.needle; v_definition_only:=false; v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start); v_source_count:=public.rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle);
  if v_row.object_type='term_definition' and v_source_count=0 then select td.definition_text into v_needle from public.term_definition td where td.id=v_row.object_id; v_definition_only:=true; v_source_count:=public.rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle); end if;
  if v_row.object_type='workflow_step' then select count(*)::integer,count(*) filter(where ws.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id where wp.extraction_run_id=p_extraction_run_id and wp.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(ws.step_name)=public.rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='accountability_route' then select count(*)::integer,count(*) filter(where ar.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.accountability_route ar where ar.extraction_run_id=p_extraction_run_id and ar.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(ar.trigger_condition)=public.rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='entity_override' then select count(*)::integer,count(*) filter(where eo.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.entity_override eo where eo.extraction_run_id=p_extraction_run_id and eo.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(eo.override_scope)=public.rosetta_v2_normalize_text(v_needle);
  else
   if v_definition_only then select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text(td.definition_text)=public.rosetta_v2_normalize_text(v_needle);
   else select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from public.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and public.rosetta_v2_normalize_text('"'||td.defined_term||'" '||td.definition_text)=public.rosetta_v2_normalize_text(v_needle); end if;
  end if;
  if v_source_count>0 and v_source_count=v_object_count then select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(v_block_text,v_needle,v_object_ordinal); v_status:=v_loc.span_status;
  elsif v_source_count>0 then select * into v_loc from public.rosetta_v2512_locate_normalized_text_occurrence(v_block_text,v_needle,1); v_status:='ambiguous';
  else v_status:='unresolved'; end if;
  if v_status in('resolved','ambiguous') and v_loc.source_offset_start is not null then v_absolute_start:=v_row.block_start+v_loc.source_offset_start; v_absolute_end:=v_row.block_start+v_loc.source_offset_end; v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start); else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;
  insert into public.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)
  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex') end,'rosetta-layout-projection-v2512',v_status)
  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
  if v_status='resolved' then v_resolved:=v_resolved+1; elsif v_status='ambiguous' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;
 end loop;
 return jsonb_build_object('contract','rosetta-object-source-span-v2512','extraction_run_id',p_extraction_run_id,'resolved',v_resolved,'ambiguous',v_ambiguous,'unresolved',v_unresolved,'occurrence_rule','resolve_only_when_source_occurrence_count_equals_object_count');
end;
$function$
