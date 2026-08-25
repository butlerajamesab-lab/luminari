CREATE OR REPLACE FUNCTION public.rosetta_v2512_normalized_occurrence_count(p_raw_text text, p_needle text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_haystack text:=lower(public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v2512_layout_projection(p_raw_text)))); v_needle text:=lower(public.rosetta_v2_normalize_text(p_needle)); v_cursor integer:=1; v_relative integer; v_count integer:=0;
begin if nullif(v_needle,'') is null then return 0; end if; loop v_relative:=strpos(substr(v_haystack,v_cursor),v_needle); exit when v_relative=0; v_count:=v_count+1; v_cursor:=v_cursor+v_relative-1+char_length(v_needle); exit when v_cursor>char_length(v_haystack); end loop; return v_count; end;
$function$
