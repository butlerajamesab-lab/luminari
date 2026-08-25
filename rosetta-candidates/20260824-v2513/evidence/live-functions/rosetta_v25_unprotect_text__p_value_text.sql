CREATE OR REPLACE FUNCTION public.rosetta_v25_unprotect_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select replace(p_value, chr(57344), '.');
$function$
