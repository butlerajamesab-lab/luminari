CREATE OR REPLACE FUNCTION public.rosetta_v24_prune_amendment_projection(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_help_count integer := 0;
  v_workflow_count integer := 0;
  v_accountability_count integer := 0;
  v_override_count integer := 0;
  v_definition_count integer := 0;
  v_coverage_count integer := 0;
begin
  delete from public.term_definition_affected_steps affected
   where affected.term_definition_id in (
     select definition.id
     from public.term_definition definition
     where definition.extraction_run_id = p_extraction_run_id
   )
      or affected.workflow_step_id in (
     select step.id
     from public.workflow_step step
     join public.workflow_pipeline pipeline
       on pipeline.id = step.workflow_pipeline_id
     where pipeline.extraction_run_id = p_extraction_run_id
   );

  if to_regclass('public.rosetta_object_correction') is not null then
    execute 'delete from public.rosetta_object_correction where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;
  if to_regclass('public.rosetta_structural_repair_queue') is not null then
    execute 'delete from public.rosetta_structural_repair_queue where extraction_run_id = $1'
      using p_extraction_run_id;
  end if;

  delete from public.help_entity
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_help_count = row_count;

  delete from public.workflow_pipeline
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_workflow_count = row_count;

  delete from public.accountability_route
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_accountability_count = row_count;

  delete from public.entity_override
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_override_count = row_count;

  delete from public.term_definition
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_definition_count = row_count;

  delete from public.layer_coverage
   where extraction_run_id = p_extraction_run_id;
  get diagnostics v_coverage_count = row_count;

  return jsonb_build_object(
    'contract', 'rosetta-amendment-projection-prune-v1',
    'extraction_run_id', p_extraction_run_id,
    'pruned', jsonb_build_object(
      'help', v_help_count,
      'workflow_pipelines', v_workflow_count,
      'accountability_routes', v_accountability_count,
      'overrides', v_override_count,
      'definitions', v_definition_count,
      'coverage_receipts', v_coverage_count
    )
  );
end;
$function$
