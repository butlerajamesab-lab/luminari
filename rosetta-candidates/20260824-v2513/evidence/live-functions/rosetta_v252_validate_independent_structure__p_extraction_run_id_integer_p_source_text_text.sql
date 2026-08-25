CREATE OR REPLACE FUNCTION public.rosetta_v252_validate_independent_structure(p_extraction_run_id integer, p_source_text text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$ select public.rosetta_v251_validate_independent_structure(p_extraction_run_id,p_source_text)||jsonb_build_object('contract','rosetta-independent-structural-validation-v252'); $function$
