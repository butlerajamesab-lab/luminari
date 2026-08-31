CREATE OR REPLACE FUNCTION rosetta_v2513.v2513_rosetta_v25_layout_projection(p_source_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_result text := p_source_text;
  v_line_label_count integer;
  v_trailing_line_number_count integer;
  v_page_counter_count integer;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  v_trailing_line_number_count := regexp_count(p_source_text,'\t[0-9]{1,3}[ \t]*(\n|$)',1,'n');
  v_page_counter_count := regexp_count(p_source_text,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)',1,'n');

  if v_line_label_count >= 3 then
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+','n');
  end if;

  -- Preserve the already-verified 2.5.12 Colorado trailing-line-number rule.
  -- C5 is additive: introducing PAGE furniture masking must not regress the
  -- projection used to create the object text that later span binding locates.
  if v_trailing_line_number_count >= 12 then
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'\t[0-9]{1,3}[ \t]*(\n|$)','n');
  end if;

  if v_result ~ 'REVISOR' or v_line_label_count >= 3 then
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[ \t]+(?:Sec[.]|Section)[ \t]+[0-9]+[A-Za-z]?[.][^\n]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)REVISOR[^\n]*(\n|$)','n');
  end if;

  if v_page_counter_count > 0 then
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*General[ \t]+Assembly[ \t]+Of[ \t]+[^\n]+[ \t]+Session[ \t]+[0-9]{4}[ \t]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*Page[ \t]+[0-9]+[ \t]+(?:House|Senate)[ \t]+Bill[^\n]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ORIGINAL[ \t]+(?:HOUSE|SENATE)[ \t]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*BILL[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ENROLLED[ \t]+ACT[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[A-Z-]+[ \t]+LEGISLATURE[ \t]+OF[ \t]+THE[ \t]+STATE[ \t]+OF[^\n]*(\n|$)','n');
    v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[0-9]{4}[ \t]+(?:BUDGET|REGULAR|GENERAL|SPECIAL)[ \t]+SESSION[ \t]*(\n|$)','n');
  end if;

  -- Colorado enrolled-bill page furniture is masked, not deleted: the
  -- projection must retain character offsets for source-span receipts.
  v_result := rosetta_v2513.v2513_rosetta_v25_mask_matches(
    v_result,
    '(^|\n)[ \t]*PAGE[ \t]+[0-9]+-(?:HOUSE|SENATE)[ \t]+BILL[ \t]+[0-9]+-[0-9]+[^\r\n]*(?:\r?\n|$)',
    'ni'
  );
  return rosetta_v2513.v2513_rosetta_v25_protect_internal_periods(v_result);
end;
$function$;
CREATE OR REPLACE FUNCTION rosetta_v2513.v2513_rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
 v_row record; v_loc_start integer; v_loc_end integer; v_loc_status text; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text; v_source_count integer; v_object_count integer; v_object_ordinal integer; v_definition_only boolean; v_status text;
begin
 delete from rosetta_v2513.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;
 for v_row in
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle from rosetta_v2513.workflow_step ws join rosetta_v2513.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join rosetta_v2513.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id
  union all select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from rosetta_v2513.accountability_route ar join rosetta_v2513.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id
  union all select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from rosetta_v2513.entity_override eo join rosetta_v2513.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id
  union all select 'term_definition',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,'"'||td.defined_term||'" '||td.definition_text from rosetta_v2513.term_definition td join rosetta_v2513.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id
  union all select 'help_entity',h.id,h.source_document_id,h.source_block_id,rb.char_offset_start,rb.char_offset_end,h.entity_name from rosetta_v2513.help_entity h join rosetta_v2513.hr1_raw_blocks rb on rb.id=h.source_block_id where h.extraction_run_id=p_extraction_run_id
  order by object_type,source_block_id,needle,object_id
 loop
  v_needle:=v_row.needle; v_definition_only:=false; v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start); v_source_count:=rosetta_v2513.v2513_rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle);
  if v_row.object_type='term_definition' and v_source_count=0 then select td.definition_text into v_needle from rosetta_v2513.term_definition td where td.id=v_row.object_id; v_definition_only:=true; v_source_count:=rosetta_v2513.v2513_rosetta_v2512_normalized_occurrence_count(v_block_text,v_needle); end if;
  if v_row.object_type='workflow_step' then select count(*)::integer,count(*) filter(where ws.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.workflow_step ws join rosetta_v2513.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id where wp.extraction_run_id=p_extraction_run_id and wp.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text(ws.step_name)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='accountability_route' then select count(*)::integer,count(*) filter(where ar.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.accountability_route ar where ar.extraction_run_id=p_extraction_run_id and ar.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text(ar.trigger_condition)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='entity_override' then select count(*)::integer,count(*) filter(where eo.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.entity_override eo where eo.extraction_run_id=p_extraction_run_id and eo.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text(eo.override_scope)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle);
  elsif v_row.object_type='help_entity' then select count(*)::integer,count(*) filter(where h.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.help_entity h where h.extraction_run_id=p_extraction_run_id and h.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text(h.entity_name)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle);
  else
   if v_definition_only then select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text(td.definition_text)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle);
   else select count(*)::integer,count(*) filter(where td.id<=v_row.object_id)::integer into v_object_count,v_object_ordinal from rosetta_v2513.term_definition td where td.extraction_run_id=p_extraction_run_id and td.source_block_id=v_row.source_block_id and rosetta_v2513.v2513_rosetta_v2_normalize_text('"'||td.defined_term||'" '||td.definition_text)=rosetta_v2513.v2513_rosetta_v2_normalize_text(v_needle); end if;
  end if;
  v_loc_start:=null;v_loc_end:=null;v_loc_status:=null;
  if v_source_count>0 and v_source_count=v_object_count then
   select loc.source_offset_start,loc.source_offset_end,loc.span_status
     into v_loc_start,v_loc_end,v_loc_status
   from rosetta_v2513.v2513_rosetta_v2512_locate_normalized_text_occurrence(
     v_block_text,v_needle,v_object_ordinal) loc;
   v_status:=coalesce(v_loc_status,'unresolved');
  elsif v_source_count>0 then
   select loc.source_offset_start,loc.source_offset_end,loc.span_status
     into v_loc_start,v_loc_end,v_loc_status
   from rosetta_v2513.v2513_rosetta_v2512_locate_normalized_text_occurrence(
     v_block_text,v_needle,1) loc;
   v_status:=case when v_loc_status in('resolved','ambiguous')
     then 'ambiguous' else 'unresolved' end;
  else v_status:='unresolved'; end if;
  -- convergence C3: fail closed unless the needle is verified in the hash-bound projection
  if v_status in('resolved','ambiguous')
     and not rosetta_v2513.v2513_rosetta_v25_projected_contains(v_block_text, v_needle) then
   v_status:='unresolved';
  end if;
  if v_status in('resolved','ambiguous') and v_loc_start is not null then v_absolute_start:=v_row.block_start+v_loc_start; v_absolute_end:=v_row.block_start+v_loc_end; v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start); else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;
  insert into rosetta_v2513.projection_receipt(extraction_run_id,object_type,object_id,raw_sha256,projected_sha256,projection_method,projection_version,offset_mapping,offset_mapping_status,charset_receipt,excluded_regions,verified)
  select p_extraction_run_id, v_row.object_type, v_row.object_id::text,
         r.receipt->>'raw_sha256', r.receipt->>'projected_sha256', r.receipt->>'projection_method', r.receipt->>'projection_version',
         null, r.receipt->>'offset_mapping_status', r.receipt->'charset_receipt', r.receipt->'excluded_regions',
         rosetta_v2513.v2513_rosetta_v25_verify_projection(v_block_text, rosetta_v2513.v2513_rosetta_v25_layout_projection(v_block_text))
  from (select rosetta_v2513.v2513_rosetta_v25_projection_receipt(v_block_text) as receipt) as r;
  insert into rosetta_v2513.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)
  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex') end,'rosetta-layout-projection-v2513',v_status)
  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
  if v_status='resolved' then v_resolved:=v_resolved+1; elsif v_status='ambiguous' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;
 end loop;
 return jsonb_build_object('contract','rosetta-object-source-span-v2513','extraction_run_id',p_extraction_run_id,'resolved',v_resolved,'ambiguous',v_ambiguous,'unresolved',v_unresolved,'occurrence_rule','resolve_only_when_source_occurrence_count_equals_object_count');
end;
$function$;
