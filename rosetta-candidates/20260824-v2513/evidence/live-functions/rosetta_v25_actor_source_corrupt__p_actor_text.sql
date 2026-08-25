CREATE OR REPLACE FUNCTION public.rosetta_v25_actor_source_corrupt(p_actor text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select
    nullif(btrim(coalesce(p_actor,'')), '') is null
    or coalesce(p_actor,'') ~ '^\s*[0-9]+(?:\s|\.|\))'
    or coalesce(p_actor,'') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--';
$function$
