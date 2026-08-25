CREATE OR REPLACE FUNCTION public.rosetta_is_current_publishable_run_v1(p_extraction_run_id integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select exists(
   select 1 from public.extraction_run run cross join public.rosetta_current_generation_registry_v1 target
   where target.singleton=true and run.id=p_extraction_run_id
     and run.run_status in ('completed','validated') and run.admissibility_state='admissible'
     and run.engine_version=target.engine_version and run.rule_set_version=target.rule_set_version and run.rule_manifest_hash=target.rule_manifest_hash
     and exists(select 1 from public.validation_result validation where validation.extraction_run_id=run.id and validation.test_name=target.validation_test_name and validation.test_result='pass' and validation.failure_count=0)
     and public.rosetta_blocking_structural_repair_count(run.id)=0
     and not exists(
       select 1 from public.extraction_run newer
       where newer.source_document_id=run.source_document_id and newer.id>run.id
         and newer.run_status in ('completed','validated') and newer.admissibility_state='admissible'
         and newer.engine_version=target.engine_version and newer.rule_set_version=target.rule_set_version and newer.rule_manifest_hash=target.rule_manifest_hash
         and exists(select 1 from public.validation_result nv where nv.extraction_run_id=newer.id and nv.test_name=target.validation_test_name and nv.test_result='pass' and nv.failure_count=0)
         and public.rosetta_blocking_structural_repair_count(newer.id)=0
     )
 );
$function$
