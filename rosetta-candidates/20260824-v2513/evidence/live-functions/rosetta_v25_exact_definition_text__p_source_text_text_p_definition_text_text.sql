CREATE OR REPLACE FUNCTION public.rosetta_v25_exact_definition_text(p_source_text text, p_definition_text text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_source text:=public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v25_layout_projection(p_source_text))); v_definition text:=public.rosetta_v2_normalize_text(p_definition_text); v_position integer;
begin v_position:=strpos(lower(v_source),lower(v_definition)); if v_position>0 then return substr(v_source,v_position,char_length(v_definition)); end if; return v_definition; end;$function$
