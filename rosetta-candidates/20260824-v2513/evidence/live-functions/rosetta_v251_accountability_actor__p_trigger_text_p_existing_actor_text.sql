CREATE OR REPLACE FUNCTION public.rosetta_v251_accountability_actor(p_trigger text, p_existing_actor text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case when coalesce(p_trigger,'') ~* '\m(?:guilty|felony|sentenc|penalt|forfeitur)' and coalesce(p_trigger,'') ~* '\mis\s+guilty\M' then nullif(btrim(regexp_replace(p_trigger,'(?i)\s+is\s+guilty\b.*$','')),'') else nullif(btrim(coalesce(p_existing_actor,'')),'') end;
$function$
