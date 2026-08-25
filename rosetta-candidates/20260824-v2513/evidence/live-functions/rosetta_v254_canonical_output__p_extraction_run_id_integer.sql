CREATE OR REPLACE FUNCTION public.rosetta_v254_canonical_output(p_extraction_run_id integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with law as (
    select *
    from public.v_rosetta_operator_law_view_v1
    where extraction_run_id = p_extraction_run_id
  ),
  counts as (
    select jsonb_build_object(
      'raw_blocks', (select count(*) from public.hr1_raw_blocks where extraction_run_id = p_extraction_run_id),
      'help', (select count(*) from public.help_entity where extraction_run_id = p_extraction_run_id),
      'workflow_pipelines', (select count(*) from public.workflow_pipeline where extraction_run_id = p_extraction_run_id),
      'workflow_steps', (
        select count(*) from public.workflow_step step
        join public.workflow_pipeline pipeline on pipeline.id = step.workflow_pipeline_id
        where pipeline.extraction_run_id = p_extraction_run_id
      ),
      'accountability_routes', (select count(*) from public.accountability_route where extraction_run_id = p_extraction_run_id),
      'overrides', (select count(*) from public.entity_override where extraction_run_id = p_extraction_run_id),
      'definitions', (select count(*) from public.term_definition where extraction_run_id = p_extraction_run_id),
      'coverage', (select count(*) from public.layer_coverage where extraction_run_id = p_extraction_run_id)
    ) as value
  )
  select jsonb_build_object(
    'contract', 'rosetta-canonical-law-view-v254',
    'extraction_run_id', law.extraction_run_id,
    'source_document_id', law.source_document_id,
    'engine_version', law.engine_version,
    'rule_set_version', law.rule_set_version,
    'rule_manifest_hash', law.rule_manifest_hash,
    'configuration_hash', law.configuration_hash,
    'source_identity_hash', law.source_identity_hash,
    'source_content_hash', law.source_content_hash,
    'objects', law.objects,
    'coverage', law.coverage,
    'provenance_state', law.provenance_state,
    'row_counts', counts.value
  ) from law, counts;
$function$
