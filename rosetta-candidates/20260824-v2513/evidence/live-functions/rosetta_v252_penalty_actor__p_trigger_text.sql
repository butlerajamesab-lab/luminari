CREATE OR REPLACE FUNCTION public.rosetta_v252_penalty_actor(p_trigger text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$ select nullif(btrim(regexp_replace(p_trigger,'(?i)\s+is\s+guilty\M.*$','')),''); $function$
