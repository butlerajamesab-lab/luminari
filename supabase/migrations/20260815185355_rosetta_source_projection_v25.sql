begin

create or replace function public.rosetta_v25_mask_matches(
  p_value text,
  p_pattern text,
  p_flags text default 'n'
)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_result text := p_value;
  v_search_start integer := 1;
  v_start integer;
  v_end integer;
  v_segment text;
  v_mask text;
begin
  loop
    v_start := regexp_instr(v_result, p_pattern, v_search_start, 1, 0, p_flags);
    exit when v_start = 0;
    v_end := regexp_instr(v_result, p_pattern, v_search_start, 1, 1, p_flags);
    exit when v_end <= v_start;
    v_segment := substr(v_result, v_start, v_end - v_start);
    v_mask := regexp_replace(v_segment, '[^\n\r]', ' ', 'g');
    v_result := overlay(v_result placing v_mask from v_start for v_end - v_start);
    v_search_start := v_end;
  end loop;
  return v_result;
end;
$$

create or replace function public.rosetta_v25_is_internal_period(p_value text,p_index integer)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_previous text := substr(p_value, greatest(1, p_index - 1), 1);
  v_next text := substr(p_value, p_index + 1, 1);
  v_left text := substr(p_value, 1, greatest(0, p_index - 1));
  v_after text := ltrim(substr(p_value, p_index + 1));
  v_word text;
  v_dotted text;
begin
  if substr(p_value, p_index, 1) <> '.' then return false; end if;
  if v_previous ~ '[0-9A-Za-z]' and v_next ~ '[0-9]' then return true; end if;
  if v_previous ~ '[A-Za-z]' and v_next ~ '[A-Za-z]' then return true; end if;
  v_word := (regexp_match(v_left, '([A-Za-z]+)$'))[1];
  if v_word is not null and lower(v_word) = any(array['art','co','corp','dr','e','etc','i','inc','mr','mrs','ms','no','st','v','vs']) and v_after <> '' then return true; end if;
  if v_word = 'Pub' and v_after ~ '^L[.]\s*(?:No[.]\s*)?[0-9]' then return true; end if;
  if v_left ~ '[0-9]+\s+F$' and v_after ~ '^Supp[.]\s*[0-9]' then return true; end if;
  if v_left ~ '[0-9]+\s+F[.]\s+Supp$' and v_after ~ '^[0-9]' then return true; end if;
  if v_left ~ '[0-9]+\s+S$' and v_after ~ '^Ct[.]\s*[0-9]' then return true; end if;
  if v_left ~ '[0-9]+\s+S[.]\s+Ct$' and v_after ~ '^[0-9]' then return true; end if;
  v_dotted := (regexp_match(v_left, '([A-Za-z]+(?:[.][A-Za-z]+)+)$'))[1];
  if v_dotted is not null and v_after <> '' and v_after !~ '^(?:A|An|Each|Every|No|That|The|This)\M' then return true; end if;
  if v_word is not null and v_word ~ '^[A-Z]$' and v_after ~ '^(?:[0-9]|No[.]\s*[0-9])' then return true; end if;
  return false;
end;
$$

create or replace function public.rosetta_v25_protect_internal_periods(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_result text := p_value;
  v_index integer;
  v_marker text := chr(57344);
begin
  if char_length(p_value) < 3 then return p_value; end if;
  for v_index in 2..char_length(p_value) - 1 loop
    if substr(p_value, v_index, 1) = '.' and public.rosetta_v25_is_internal_period(p_value, v_index) then
      v_result := overlay(v_result placing v_marker from v_index for 1);
    end if;
  end loop;
  return v_result;
end;
$$

create or replace function public.rosetta_v25_unprotect_text(p_value text)
returns text language sql immutable strict set search_path = pg_catalog as $$
  select replace(p_value, chr(57344), '.');
$$

create or replace function public.rosetta_v25_layout_projection(p_source_text text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, public
as $$
declare
  v_result text := p_source_text;
  v_line_label_count integer;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  if v_line_label_count >= 3 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+','n');
  end if;
  if v_result ~ 'REVISOR' or v_line_label_count >= 3 then
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[0-9]{1,3}[ \t]+(?:Sec[.]|Section)[ \t]+[0-9]+[A-Za-z]?[.][^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)REVISOR[^\n]*(\n|$)','n');
    v_result := public.rosetta_v25_mask_matches(v_result,'(^|\n)[ \t]*--[ \t]*[0-9]+[ \t]+of[ \t]+[0-9]+[ \t]*--[ \t]*(\n|$)','n');
  end if;
  return public.rosetta_v25_protect_internal_periods(v_result);
end;
$$

create or replace function public.rosetta_v25_section_spans(p_source_text text)
returns table(section_ordinal integer,section_number text,char_offset_start integer,char_offset_end integer,section_text text)
language plpgsql immutable strict set search_path = pg_catalog, public
as $$
declare
  v_projection text := public.rosetta_v25_layout_projection(p_source_text);
  v_length integer := char_length(p_source_text);
  v_line_label_count integer;
  v_pattern text;
  v_first integer;
  v_start integer;
  v_next integer;
  v_end integer;
  v_ordinal integer := 0;
  v_marker text;
  v_number text;
begin
  v_line_label_count := regexp_count(p_source_text,'(^|\n)[0-9]{1,3}[.][0-9]{1,3}[ \t]+',1,'n');
  if v_line_label_count >= 3 then
    v_pattern := '(^|\n)[ \t]*(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.]';
  else
    v_pattern := '(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*[0-9]+[A-Za-z]?[.]';
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
    exit when v_start=0 or v_start>v_length;
    v_next := regexp_instr(v_projection,v_pattern,v_start+1,1,0,'n');
    if v_next>0 then while v_next<=v_length and substr(v_projection,v_next,1) ~ '[[:space:]]' loop v_next := v_next+1; end loop; end if;
    v_end := case when v_next=0 then v_length+1 else v_next end;
    v_marker := (regexp_match(substr(v_projection,v_start,least(80,v_end-v_start)),'(Section|SECTION|Sec[.]|SEC[.])[ \t]*([0-9]+[A-Za-z]?)[.]'))[1];
    v_number := (regexp_match(substr(v_projection,v_start,least(80,v_end-v_start)),'(?:Section|SECTION|Sec[.]|SEC[.])[ \t]*([0-9]+[A-Za-z]?)[.]'))[1];
    if v_marker is null or v_number is null then raise exception 'rosetta_v25_section_marker_resolution_failed at %',v_start; end if;
    v_ordinal := v_ordinal+1;
    return query select v_ordinal,'Sec. '||v_number,v_start-1,v_end-1,substr(p_source_text,v_start,v_end-v_start);
    exit when v_next=0;
    v_start := v_next;
  end loop;
end;
$$

create or replace function public.rosetta_v25_modal_and_actor(p_clause text)
returns table(modal text,actor text)
language plpgsql immutable strict set search_path = pg_catalog, public
as $$
declare v_normalized text; v_match text[];
begin
  v_normalized := public.rosetta_v25_unprotect_text(public.rosetta_v2_normalize_text(p_clause));
  v_normalized := regexp_replace(v_normalized,'^(?:\([a-z0-9]+\)\s*)+','','i');
  v_normalized := regexp_replace(v_normalized,'^\d+[.)]\s*','');
  v_match := regexp_match(v_normalized,'(?i)^(.{1,2000}?)\s+(shall|must|may)\s+not\M');
  if v_match is not null then return query select lower(v_match[2]||' not'),nullif(btrim(v_match[1],E' \t\r\n,;:'),''); return; end if;
  v_match := regexp_match(v_normalized,'(?i)^(.{1,2000}?)\s+(shall|must|may)\M');
  if v_match is null then return query select null::text,null::text; return; end if;
  return query select lower(v_match[2]),nullif(btrim(v_match[1],E' \t\r\n,;:'),'');
end;
$$

create or replace function public.rosetta_v25_clause_structurally_sound(p_clause text,p_actor text,p_modal text)
returns boolean language sql immutable strict set search_path = pg_catalog, public as $$
  select nullif(btrim(p_clause),'') is not null
    and nullif(btrim(p_actor),'') is not null
    and lower(p_modal) in ('shall','shall not','must','must not','may','may not')
    and p_actor !~ '^\s*[0-9]+\M'
    and p_clause !~* '\mREVISOR\M|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
    and p_clause !~ '(^|\s)[0-9]{1,3}[.][0-9]{1,3}(\s|$)'
    and right(btrim(p_clause),1)='.';
$$

create or replace function public.rosetta_v25_normative_clauses(p_source_text text)
returns table(section_ordinal integer,section_number text,clause_ordinal integer,clause_text text,actor text,modal text)
language plpgsql immutable strict set search_path = pg_catalog, public
as $$
declare v_section record; v_match text[]; v_projection text; v_clause text; v_actor text; v_modal text; v_ordinal integer:=0;
begin
  for v_section in select * from public.rosetta_v25_section_spans(p_source_text) order by section_ordinal loop
    v_projection := public.rosetta_v25_layout_projection(v_section.section_text);
    for v_match in select regexp_matches(public.rosetta_v2_normalize_text(v_projection),'(?i)([^.]{0,4000}\m(shall not|must not|may not|shall|must|may)\M[^.]{0,16000}[.])','g') loop
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
$$

revoke all on function public.rosetta_v25_mask_matches(text,text,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_is_internal_period(text,integer) from public,anon,authenticated

revoke all on function public.rosetta_v25_protect_internal_periods(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_unprotect_text(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_layout_projection(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_section_spans(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_modal_and_actor(text) from public,anon,authenticated

revoke all on function public.rosetta_v25_clause_structurally_sound(text,text,text) from public,anon,authenticated

revoke all on function public.rosetta_v25_normative_clauses(text) from public,anon,authenticated

grant execute on function public.rosetta_v25_layout_projection(text) to service_role

grant execute on function public.rosetta_v25_section_spans(text) to service_role

grant execute on function public.rosetta_v25_modal_and_actor(text) to service_role

grant execute on function public.rosetta_v25_normative_clauses(text) to service_role

comment on function public.rosetta_v25_layout_projection(text) is 'Offset-preserving Rosetta 2.5 parsing projection. Masks repeated printed line/page furniture and protects internal citation punctuation without modifying immutable source text or source offsets.'

comment on function public.rosetta_v25_section_spans(text) is 'Rosetta 2.5 section locator. Uses the offset-preserving parsing projection to ignore printed page furniture and recognizes both Section N. and Sec. N. source headings while returning exact raw-source spans.'

commit
