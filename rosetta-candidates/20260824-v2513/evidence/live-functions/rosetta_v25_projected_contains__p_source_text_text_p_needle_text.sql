CREATE OR REPLACE FUNCTION public.rosetta_v25_projected_contains(p_source_text text, p_needle text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select strpos(lower(public.rosetta_v2_normalize_text(public.rosetta_v25_unprotect_text(public.rosetta_v25_layout_projection(p_source_text)))),lower(public.rosetta_v2_normalize_text(p_needle)))>0;
$function$
