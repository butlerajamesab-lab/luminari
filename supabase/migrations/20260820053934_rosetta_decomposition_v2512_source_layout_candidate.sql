begin

-- Rosetta 2.5.12 is an append-only candidate generation. It preserves every
-- 2.5.11 receipt and changes only versioned parsing/provenance helpers used by
-- the 2.5.12 candidate path. Current-generation authority is not moved here.

create or replace function public.rosetta_v2512_layout_projection(p_source_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $function$
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
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+','n');
  end if;

  if v_trailing_line_number_count >= 12 then
    v_result := public.rosetta_v25_mask_matches(v_result,'\t[0-9]{1,3}[ \t]*(\n|$)','n');
  end if;

  if v_result ~ 'REVISOR' or v_line_label_count >= 3 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[ \t]+(?:Sec[.]|Section)[ \t]+[0-9]+[A-Za-z]?[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)REVISOR[^\n]*(\n|$)','n');
  end if;

  if v_page_counter_count > 0 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*General[ \t]+Assembly[ \t]+Of[ \t]+[^\n]+[ \t]+Session[ \t]+[0-9]{4}[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*Page[ \t]+[0-9]+[ \t]+(?:House|Senate)[ \t]+Bill[^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ORIGINAL[ \t]+(?:HOUSE|SENATE)[ \t]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*BILL[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*ENROLLED[ \t]+ACT[ \t]+NO[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[A-Z-]+[ \t]+LEGISLATURE[ \t]+OF[ \t]+THE[ \t]+STATE[ \t]+OF[^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*[0-9]{4}[ \t]+(?:BUDGET|REGULAR|GENERAL|SPECIAL)[ \t]+SESSION[ \t]*(\n|$)','n');
  end if;

  return public.rosetta_v25_protect_internal_periods(v_result);
end;
$function$

create or replace function public.rosetta_v2512_section_spans(p_source_text text)
returns table(section_ordinal integer,section_number text,char_offset_start integer,char_offset_end integer,section_text text)
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $function$
declare
  v_projection text := public.rosetta_v2512_layout_projection(p_source_text);
  v_length integer := char_length(p_source_text);
  v_line_label_count integer;
  v_pattern text;
  v_first integer;
  v_start integer;
  v_next integer;
  v_end integer;
  v_ordinal integer := 0;
  v_number text;
  v_suffix text;
  v_match text[];
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  if v_line_label_count >= 3 then
    v_pattern := '(^|\n)[ \t]*(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.](?:[(][A-Za-z0-9]+[)])?';
  else
    v_pattern := '(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.](?:[(][A-Za-z0-9]+[)])?';
  end if;
  v_first := regexp_instr(v_projection,v_pattern,1,1,0,'n');
  if v_first = 0 then
    return query select 1,'Document'::text,0,v_length,p_source_text;
    return;
  end if;
  while v_first <= v_length and substr(v_projection,v_first,1) ~ '[[:space:]]' loop v_first := v_first + 1; end loop;
  if v_first > 1 and nullif(btrim(substr(p_source_text,1,v_first-1)),'') is not null then
    v_ordinal := v_ordinal + 1;
    return query select v_ordinal,'Preamble'::text,0,v_first-1,substr(p_source_text,1,v_first-1);
  end if;
  v_start := v_first;
  loop
    exit when v_start = 0 or v_start > v_length;
    v_next := regexp_instr(v_projection,v_pattern,v_start+1,1,0,'n');
    if v_next > 0 then
      while v_next <= v_length and substr(v_projection,v_next,1) ~ '[[:space:]]' loop v_next := v_next + 1; end loop;
    end if;
    v_end := case when v_next = 0 then v_length + 1 else v_next end;
    v_match := regexp_match(substr(v_projection,v_start,least(100,v_end-v_start)),'(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*([0-9]+[A-Za-z]?)[.]([(][A-Za-z0-9]+[)])?');
    v_number := v_match[1];
    v_suffix := v_match[2];
    if v_number is null then raise exception 'rosetta_v2512_section_marker_resolution_failed at %',v_start; end if;
    v_ordinal := v_ordinal + 1;
    return query select v_ordinal,'Sec. '||v_number||case when v_suffix is null then '' else '.'||v_suffix end,v_start-1,v_end-1,substr(p_source_text,v_start,v_end-v_start);
    exit when v_next = 0;
    v_start := v_next;
  end loop;
end;
$function$

create or replace function public.rosetta_v2512_normative_clauses(p_source_text text)
returns table(section_ordinal integer,section_number text,clause_ordinal integer,clause_text text,actor text,modal text)
language plpgsql immutable strict set search_path = pg_catalog, public
as $function$
declare v_section record; v_match text[]; v_projection text; v_clause text; v_actor text; v_modal text; v_ordinal integer:=0;
begin
  for v_section in select * from public.rosetta_v2512_section_spans(p_source_text) order by section_ordinal loop
    v_projection := public.rosetta_v2512_layout_projection(v_section.section_text);
    for v_match in select regexp_matches(public.rosetta_v2_normalize_text(v_projection),'(?i)([^.]*\m(shall not|must not|may not|shall|must|may)\M[^.]*[.])','g') loop
      v_clause := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(v_match[1]));
      select inferred.modal,inferred.actor into v_modal,v_actor from public.rosetta_v25_modal_and_actor(v_clause) inferred;
      if v_modal is null or v_actor is null then continue; end if;
      if public.rosetta_v2_is_legislative_finding(v_clause,v_modal) then continue; end if;
      if not public.rosetta_v25_clause_structurally_sound(v_clause,v_actor,v_modal) then continue; end if;
      v_ordinal:=v_ordinal+1;
      return query select v_section.section_ordinal,v_section.section_number,v_ordinal,v_clause,v_actor,v_modal;
    end loop;
  end loop;
end;
$function$

create or replace function public.rosetta_v2512_projected_contains(p_source_text text,p_needle text)
returns boolean language sql immutable strict set search_path = pg_catalog, public
as $function$
 select strpos(lower(public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v2512_layout_projection(p_source_text)))),lower(public.rosetta_v2_normalize_text(p_needle)))>0;
$function$

create or replace function public.rosetta_v2512_exact_definition_text(p_source_text text,p_definition_text text)
returns text language plpgsql immutable strict set search_path = pg_catalog, public
as $function$
declare v_source text:=public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v2512_layout_projection(p_source_text))); v_definition text:=public.rosetta_v2_normalize_text(p_definition_text); v_position integer;
begin v_position:=strpos(lower(v_source),lower(v_definition)); if v_position>0 then return substr(v_source,v_position,char_length(v_definition)); end if; return v_definition; end;
$function$

create or replace function public.rosetta_v2512_normalized_occurrence_count(p_raw_text text,p_needle text)
returns integer language plpgsql immutable strict set search_path = pg_catalog, public
as $function$
declare v_haystack text:=lower(public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v2512_layout_projection(p_raw_text)))); v_needle text:=lower(public.rosetta_v2_normalize_text(p_needle)); v_cursor integer:=1; v_relative integer; v_count integer:=0;
begin if nullif(v_needle,'') is null then return 0; end if; loop v_relative:=strpos(substr(v_haystack,v_cursor),v_needle); exit when v_relative=0; v_count:=v_count+1; v_cursor:=v_cursor+v_relative-1+char_length(v_needle); exit when v_cursor>char_length(v_haystack); end loop; return v_count; end;
$function$

create or replace function public.rosetta_v2512_locate_normalized_text_occurrence(p_raw_text text,p_needle text,p_occurrence integer)
returns table(source_offset_start integer,source_offset_end integer,span_status text)
language plpgsql immutable strict set search_path = pg_catalog, public
as $function$
declare
 v_clean_raw text:=public.rosetta_v25_unprotect_text(public.rosetta_v2512_layout_projection(p_raw_text)); v_haystack text:=public.rosetta_v2_normalize_text(v_clean_raw); v_needle text:=public.rosetta_v2_normalize_text(p_needle); v_search integer:=1; v_relative integer; v_start_norm integer:=0; v_end_norm integer; v_iteration integer; v_index integer; v_char text; v_norm_pos integer:=0; v_seen_nonspace boolean:=false; v_pending_space boolean:=false; v_space_raw_start integer:=null; v_raw_start integer:=null; v_raw_end integer:=null;
begin
 if p_occurrence<1 or nullif(v_needle,'') is null then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 for v_iteration in 1..p_occurrence loop v_relative:=strpos(lower(substr(v_haystack,v_search)),lower(v_needle)); if v_relative=0 then return query select null::integer,null::integer,'unresolved'::text; return; end if; v_start_norm:=v_search+v_relative-1; v_search:=v_start_norm+char_length(v_needle); end loop;
 v_end_norm:=v_start_norm+char_length(v_needle)-1;
 for v_index in 1..char_length(v_clean_raw) loop
  v_char:=substr(v_clean_raw,v_index,1);
  if v_char ~ '[[:space:]]' then if v_seen_nonspace and not v_pending_space then v_pending_space:=true; v_space_raw_start:=v_index; end if; continue; end if;
  if v_pending_space and v_seen_nonspace then v_norm_pos:=v_norm_pos+1; if v_norm_pos=v_start_norm then v_raw_start:=v_space_raw_start; end if; if v_norm_pos=v_end_norm then v_raw_end:=v_index; end if; end if;
  v_pending_space:=false; v_space_raw_start:=null; v_seen_nonspace:=true; v_norm_pos:=v_norm_pos+1; if v_norm_pos=v_start_norm then v_raw_start:=v_index; end if; if v_norm_pos=v_end_norm then v_raw_end:=v_index+1; exit; end if;
 end loop;
 if v_raw_start is null or v_raw_end is null or v_raw_end<=v_raw_start then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 return query select v_raw_start-1,v_raw_end-1,'resolved'::text;
end;
$function$

create or replace function public.rosetta_v2512_refresh_object_source_spans(p_extraction_run_id integer,p_source_text text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions
as $function$
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

do $clone$
declare v_definition text; v_signature text;
begin
 foreach v_signature in array array[
 'public.rosetta_v2511_amendment_disposition(text,jsonb)','public.rosetta_v2511_amendment_format(text)','public.rosetta_v2511_clean_amendment_operation_text(text)','public.rosetta_v2511_amendment_operations(text)','public.rosetta_v2511_canonical_output(integer)','public.rosetta_v2511_finalize_extraction(integer,text,jsonb,jsonb)','public.rosetta_v2511_reclassify_amendment_structure(integer,text,jsonb)','public.rosetta_v2511_reconcile_structural_correctness(integer)','public.rosetta_v2511_final_coverage(integer)','public.rosetta_v2511_refresh_final_coverage_receipts(integer)','public.rosetta_v2511_validate_extraction(integer,text)','public.rosetta_v2511_validate_independent_structure(integer,text)','public.run_rosetta_v3_extraction_v2511_base(integer,text,text,text,text,text,text,text,date,text,jsonb)','public.run_rosetta_v3_extraction_v2511_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)','public.run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)'
 ] loop
  select pg_get_functiondef(v_signature::regprocedure) into v_definition; if v_definition is null then raise exception 'rosetta_v2512_clone_source_missing:%',v_signature; end if; v_definition:=replace(v_definition,'v2511','v2512'); v_definition:=replace(v_definition,'2.5.11','2.5.12'); execute v_definition;
 end loop;
end;
$clone$

do $patch_base$
declare v_definition text; v_patched text;
begin select pg_get_functiondef('public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition; v_patched:=replace(v_definition,'rosetta_v25_layout_projection','rosetta_v2512_layout_projection'); v_patched:=replace(v_patched,'rosetta_v25_section_spans','rosetta_v2512_section_spans'); v_patched:=replace(v_patched,'rosetta_v25_normative_clauses','rosetta_v2512_normative_clauses'); if v_patched=v_definition then raise exception 'rosetta_v2512_base_patch_anchor_missing'; end if; execute v_patched; end;
$patch_base$

do $patch_finalize$
declare v_definition text; v_patched text;
begin select pg_get_functiondef('public.rosetta_v2512_finalize_extraction(integer,text,jsonb,jsonb)'::regprocedure) into v_definition; v_patched:=replace(v_definition,'rosetta_v25_exact_definition_text','rosetta_v2512_exact_definition_text'); v_patched:=replace(v_patched,'rosetta_v25_projected_contains','rosetta_v2512_projected_contains'); if v_patched=v_definition then raise exception 'rosetta_v2512_finalize_patch_anchor_missing'; end if; execute v_patched; end;
$patch_finalize$

do $patch_candidate_base$
declare v_definition text; v_patched text;
begin select pg_get_functiondef('public.run_rosetta_v3_extraction_v2512_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb)'::regprocedure) into v_definition; v_patched:=replace(v_definition,'rosetta_v25_refresh_object_source_spans','rosetta_v2512_refresh_object_source_spans'); if v_patched=v_definition then raise exception 'rosetta_v2512_candidate_base_patch_anchor_missing'; end if; execute v_patched; end;
$patch_candidate_base$

do $manifest$
declare v_prior jsonb; v_manifest jsonb; v_hash text;
begin
 select manifest_json into v_prior from public.extraction_rule_manifest where engine_version='rosetta-v3-deterministic-sql-2.5.11' and rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'; if v_prior is null then raise exception 'rosetta_v2512_prior_manifest_missing'; end if;
 v_manifest:=v_prior||jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.12','rule_set_version','rosetta-five-layer-structural-correctness-2.5.12','inherits',jsonb_build_object('engine_version','rosetta-v3-deterministic-sql-2.5.11','rule_set_version','rosetta-five-layer-structural-correctness-2.5.11','status','published_current_generation'),'provenance','Rosetta 2.5.12 is an immutable candidate generation. It preserves 2.5.11 receipts while versioning only source-layout projection, subsection-aware section identity, and occurrence-aware source-span mapping for current official legislative texts.')||jsonb_build_object('change',coalesce(v_prior->'change','{}'::jsonb)||jsonb_build_object('source_layout_projection_v2512','Masks repeated North Carolina/Wyoming legislative PDF page furniture and repeated tab-delimited printed line numbers with offset-preserving spaces; raw source text and byte hashes remain unchanged.','subsection_section_identity_v2512','SECTION N.(x) markers remain distinct structural section identities instead of collapsing to Sec. N.','occurrence_aware_source_spans_v2512','Repeated identical legal clauses are assigned to deterministic source occurrences only when extracted-object count equals source-occurrence count; mismatches remain ambiguous or unresolved.'));
 v_hash:=encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex'); insert into public.extraction_rule_manifest(engine_version,rule_set_version,manifest_hash,manifest_json,is_active) values('rosetta-v3-deterministic-sql-2.5.12','rosetta-five-layer-structural-correctness-2.5.12',v_hash,v_manifest,true) on conflict(engine_version,rule_set_version) do update set manifest_hash=excluded.manifest_hash,manifest_json=excluded.manifest_json,is_active=true;
end;
$manifest$

revoke all on function public.rosetta_v2512_layout_projection(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_section_spans(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_normative_clauses(text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_projected_contains(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_exact_definition_text(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_normalized_occurrence_count(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v2512_locate_normalized_text_occurrence(text,text,integer) from public,anon,authenticated

revoke all on function public.rosetta_v2512_refresh_object_source_spans(integer,text) from public,anon,authenticated

revoke all on function public.run_rosetta_v3_extraction_v2512_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2512_candidate_base(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated,service_role

revoke all on function public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) from public,anon,authenticated

grant execute on function public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) to service_role

comment on function public.run_rosetta_v3_extraction_v2512_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb) is 'Staged Rosetta 2.5.12 candidate. Preserves 2.5.11 current-generation truth; adds only offset-preserving legislative page-layout masking, subsection-aware section identity, and strict occurrence-aware source-span mapping. Does not promote current-generation authority.'

commit
