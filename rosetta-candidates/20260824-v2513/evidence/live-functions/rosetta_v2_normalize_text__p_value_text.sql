CREATE OR REPLACE FUNCTION public.rosetta_v2_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select btrim(regexp_replace(p_value, '[[:space:]]+', ' ', 'g'));
$function$
