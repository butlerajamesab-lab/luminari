CREATE OR REPLACE FUNCTION public.rosetta_v25_locate_normalized_text(p_raw_text text, p_needle text)
 RETURNS TABLE(source_offset_start integer, source_offset_end integer, span_status text)
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
end;$function$
