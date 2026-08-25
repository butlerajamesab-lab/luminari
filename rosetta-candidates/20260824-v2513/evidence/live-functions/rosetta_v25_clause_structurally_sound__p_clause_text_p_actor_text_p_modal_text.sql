CREATE OR REPLACE FUNCTION public.rosetta_v25_clause_structurally_sound(p_clause text, p_actor text, p_modal text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select nullif(btrim(p_clause),'') is not null and nullif(btrim(p_actor),'') is not null and lower(p_modal) in ('shall','shall not','must','must not','may','may not') and p_actor !~ '^\s*[0-9]+\M' and p_clause !~* '\mREVISOR\M|--\s*[0-9]+\s+of\s+[0-9]+\s*--' and right(btrim(p_clause),1)='.';
$function$
