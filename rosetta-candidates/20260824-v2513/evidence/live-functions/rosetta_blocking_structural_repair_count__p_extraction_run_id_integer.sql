CREATE OR REPLACE FUNCTION public.rosetta_blocking_structural_repair_count(p_extraction_run_id integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select count(*)::integer
  from public.rosetta_structural_repair_queue repair
  where repair.extraction_run_id = p_extraction_run_id
    and repair.repair_state in ('open', 'in_review')
    and (
      repair.defect_type <> 'actor_unresolved'
      or nullif(btrim(repair.defect_detail ->> 'actor_source_text'), '') is null
      or (repair.defect_detail ->> 'actor_source_text') ~ '^\s*[0-9]+(?:\s|\.|\))'
      or (repair.defect_detail ->> 'actor_source_text') ~* 'REVISOR|ENGROSSMENT|Page No|--\s*[0-9]+\s+of\s+[0-9]+\s*--'
    );
$function$
