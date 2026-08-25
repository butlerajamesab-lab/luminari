CREATE OR REPLACE FUNCTION public.rosetta_v25_section_spans(p_source_text text)
 RETURNS TABLE(section_ordinal integer, section_number text, char_offset_start integer, char_offset_end integer, section_text text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
