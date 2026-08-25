CREATE OR REPLACE FUNCTION public.rosetta_v2511_reconcile_structural_correctness(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare v_base jsonb;
begin
  v_base:=public.rosetta_v254_reconcile_structural_correctness(p_extraction_run_id);
  return v_base||jsonb_build_object('contract','rosetta-structural-reconciliation-v2511');
end;
$function$
