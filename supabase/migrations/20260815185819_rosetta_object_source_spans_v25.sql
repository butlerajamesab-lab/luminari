begin

create table if not exists public.rosetta_object_source_span (
  object_type text not null,
  object_id text not null,
  extraction_run_id integer not null references public.extraction_run(id) on delete cascade,
  source_document_id integer not null references public.source_document(id) on delete cascade,
  source_block_id text references public.hr1_raw_blocks(id) on delete cascade,
  source_offset_start integer,
  source_offset_end integer,
  raw_text text,
  normalized_text text not null,
  raw_text_hash text,
  projection_version text not null,
  span_status text not null check (span_status in ('resolved','ambiguous','unresolved')),
  created_at timestamptz not null default now(),
  primary key (object_type, object_id)
)

create index if not exists rosetta_object_source_span_run_idx on public.rosetta_object_source_span(extraction_run_id)

create index if not exists rosetta_object_source_span_document_idx on public.rosetta_object_source_span(source_document_id)

create index if not exists rosetta_object_source_span_block_idx on public.rosetta_object_source_span(source_block_id)

create or replace function public.rosetta_v25_locate_normalized_text(p_raw_text text,p_needle text)
returns table(source_offset_start integer,source_offset_end integer,span_status text)
language plpgsql immutable strict set search_path=pg_catalog,public
as $$
declare
 v_clean_raw text:=public.rosetta_v25_unprotect_text(public.rosetta_v25_layout_projection(p_raw_text));
 v_haystack text:=public.rosetta_v2_normalize_text(v_clean_raw);
 v_needle text:=public.rosetta_v2_normalize_text(p_needle);
 v_start_norm integer; v_end_norm integer; v_second integer; v_index integer; v_char text; v_norm_pos integer:=0; v_seen_nonspace boolean:=false; v_pending_space boolean:=false; v_space_raw_start integer:=null; v_raw_start integer:=null; v_raw_end integer:=null;
begin
 if nullif(v_needle,'') is null then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 v_start_norm:=strpos(lower(v_haystack),lower(v_needle));
 if v_start_norm=0 then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 v_end_norm:=v_start_norm+char_length(v_needle)-1;
 v_second:=strpos(lower(substr(v_haystack,v_start_norm+char_length(v_needle))),lower(v_needle));
 for v_index in 1..char_length(v_clean_raw) loop
  v_char:=substr(v_clean_raw,v_index,1);
  if v_char ~ '[[:space:]]' then
   if v_seen_nonspace and not v_pending_space then v_pending_space:=true; v_space_raw_start:=v_index; end if;
   continue;
  end if;
  if v_pending_space and v_seen_nonspace then
   v_norm_pos:=v_norm_pos+1;
   if v_norm_pos=v_start_norm then v_raw_start:=v_space_raw_start; end if;
   if v_norm_pos=v_end_norm then v_raw_end:=v_index; end if;
  end if;
  v_pending_space:=false; v_space_raw_start:=null; v_seen_nonspace:=true;
  v_norm_pos:=v_norm_pos+1;
  if v_norm_pos=v_start_norm then v_raw_start:=v_index; end if;
  if v_norm_pos=v_end_norm then v_raw_end:=v_index+1; exit; end if;
 end loop;
 if v_raw_start is null or v_raw_end is null or v_raw_end<=v_raw_start then return query select null::integer,null::integer,'unresolved'::text; return; end if;
 return query select v_raw_start-1,v_raw_end-1,case when v_second>0 then 'ambiguous' else 'resolved' end;
end;$$

create or replace function public.rosetta_v25_refresh_object_source_spans(p_extraction_run_id integer,p_source_text text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions
as $$
declare v_row record; v_loc record; v_block_text text; v_absolute_start integer; v_absolute_end integer; v_raw_text text; v_resolved integer:=0; v_ambiguous integer:=0; v_unresolved integer:=0; v_needle text;
begin
 delete from public.rosetta_object_source_span where extraction_run_id=p_extraction_run_id;
 for v_row in
  select 'workflow_step'::text object_type,ws.id object_id,wp.source_document_id,wp.source_block_id,rb.char_offset_start block_start,rb.char_offset_end block_end,ws.step_name needle
  from public.workflow_step ws join public.workflow_pipeline wp on wp.id=ws.workflow_pipeline_id join public.hr1_raw_blocks rb on rb.id=wp.source_block_id where wp.extraction_run_id=p_extraction_run_id
  union all
  select 'accountability_route',ar.id,ar.source_document_id,ar.source_block_id,rb.char_offset_start,rb.char_offset_end,ar.trigger_condition from public.accountability_route ar join public.hr1_raw_blocks rb on rb.id=ar.source_block_id where ar.extraction_run_id=p_extraction_run_id
  union all
  select 'entity_override',eo.id,eo.source_document_id,eo.source_block_id,rb.char_offset_start,rb.char_offset_end,eo.override_scope from public.entity_override eo join public.hr1_raw_blocks rb on rb.id=eo.source_block_id where eo.extraction_run_id=p_extraction_run_id
  union all
  select 'term_definition',td.id,td.source_document_id,td.source_block_id,rb.char_offset_start,rb.char_offset_end,'"'||td.defined_term||'" '||td.definition_text from public.term_definition td join public.hr1_raw_blocks rb on rb.id=td.source_block_id where td.extraction_run_id=p_extraction_run_id
 loop
  v_needle:=v_row.needle;
  v_block_text:=substr(p_source_text,v_row.block_start+1,v_row.block_end-v_row.block_start);
  select * into v_loc from public.rosetta_v25_locate_normalized_text(v_block_text,v_needle);
  if v_row.object_type='term_definition' and v_loc.span_status='unresolved' then
   select td.definition_text into v_needle from public.term_definition td where td.id=v_row.object_id;
   select * into v_loc from public.rosetta_v25_locate_normalized_text(v_block_text,v_needle);
  end if;
  if v_loc.span_status in ('resolved','ambiguous') then
   v_absolute_start:=v_row.block_start+v_loc.source_offset_start; v_absolute_end:=v_row.block_start+v_loc.source_offset_end;
   v_raw_text:=substr(p_source_text,v_absolute_start+1,v_absolute_end-v_absolute_start);
  else v_absolute_start:=null; v_absolute_end:=null; v_raw_text:=null; end if;
  insert into public.rosetta_object_source_span(object_type,object_id,extraction_run_id,source_document_id,source_block_id,source_offset_start,source_offset_end,raw_text,normalized_text,raw_text_hash,projection_version,span_status)
  values(v_row.object_type,v_row.object_id,p_extraction_run_id,v_row.source_document_id,v_row.source_block_id,v_absolute_start,v_absolute_end,v_raw_text,v_needle,case when v_raw_text is null then null else encode(digest(convert_to(v_raw_text,'UTF8'),'sha256'),'hex') end,'rosetta-layout-projection-v25',v_loc.span_status)
  on conflict(object_type,object_id) do update set extraction_run_id=excluded.extraction_run_id,source_document_id=excluded.source_document_id,source_block_id=excluded.source_block_id,source_offset_start=excluded.source_offset_start,source_offset_end=excluded.source_offset_end,raw_text=excluded.raw_text,normalized_text=excluded.normalized_text,raw_text_hash=excluded.raw_text_hash,projection_version=excluded.projection_version,span_status=excluded.span_status,created_at=now();
  if v_loc.span_status='resolved' then v_resolved:=v_resolved+1; elsif v_loc.span_status='ambiguous' then v_ambiguous:=v_ambiguous+1; else v_unresolved:=v_unresolved+1; end if;
 end loop;
 return jsonb_build_object('contract','rosetta-object-source-span-v25','extraction_run_id',p_extraction_run_id,'resolved',v_resolved,'ambiguous',v_ambiguous,'unresolved',v_unresolved);
end;$$

revoke all on table public.rosetta_object_source_span from public,anon,authenticated

grant select on table public.rosetta_object_source_span to service_role

revoke all on function public.rosetta_v25_locate_normalized_text(text,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_refresh_object_source_spans(integer,text) from public,anon,authenticated

grant execute on function public.rosetta_v25_refresh_object_source_spans(integer,text) to service_role

comment on table public.rosetta_object_source_span is 'Exact raw-source span receipts for Rosetta normalized objects. Offsets are zero-based/exclusive and map through the length-preserving v2.5 parsing projection.'

commit
