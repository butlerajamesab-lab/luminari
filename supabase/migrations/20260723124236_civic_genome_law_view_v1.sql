create or replace view public.v_civic_genome_law_view_v1
with (security_invoker = true)
as
with run_base as (
  select
    er.id as extraction_run_id,
    er.source_document_id,
    er.run_version,
    er.run_status,
    er.confidence_threshold,
    er.created_at,
    er.completed_at,
    sd.corpus_id,
    sd.document_name,
    sd.document_type,
    sd.document_identifier
  from public.extraction_run er
  join public.source_document sd on sd.id = er.source_document_id
),
coverage as (
  select
    extraction_run_id,
    jsonb_object_agg(lower(layer_name), jsonb_build_object(
      'status', coverage_status,
      'reason', reason,
      'validated_at', validated_at
    ) order by layer_name) as coverage_json
  from public.layer_coverage
  group by extraction_run_id
),
objects as (
  select extraction_run_id, jsonb_agg(object_json order by layer_name, object_id) as objects_json
  from (
    select
      extraction_run_id,
      'help'::text as layer_name,
      id as object_id,
      jsonb_build_object(
        'layer','help','key',id,'source_object_type','help_entity','source_object_id',id,
        'source_block_id',source_block_id,'extraction_run_id',extraction_run_id::text,
        'normalized_value',jsonb_build_object('entity_name',entity_name,'entity_type',entity_type,'governing_section',governing_section,'status',status,'effective_date',effective_date,'sunset_date',sunset_date),
        'confidence',coalesce(confidence,0),'confirmed',coalesce(signal_status,'') in ('confirmed','verified','accepted'),
        'metadata',jsonb_build_object('canon_version',canon_version,'signal_status',signal_status)
      ) as object_json
    from public.help_entity
    union all
    select
      extraction_run_id,'workflow',id,
      jsonb_build_object(
        'layer','workflow','key',id,'source_object_type','workflow_pipeline','source_object_id',id,
        'source_block_id',source_block_id,'extraction_run_id',extraction_run_id::text,
        'normalized_value',jsonb_build_object('pipeline_name',pipeline_name,'governing_section',governing_section,'pipeline_type',pipeline_type),
        'confidence',coalesce(confidence,0),'confirmed',coalesce(signal_status,'') in ('confirmed','verified','accepted'),
        'metadata',jsonb_build_object('canon_version',canon_version,'signal_status',signal_status)
      )
    from public.workflow_pipeline
    union all
    select
      extraction_run_id,'accountability',id,
      jsonb_build_object(
        'layer','accountability','key',id,'source_object_type','accountability_route','source_object_id',id,
        'source_block_id',source_block_id,'extraction_run_id',extraction_run_id::text,
        'normalized_value',jsonb_build_object('route_name',route_name,'governing_section',governing_section,'trigger_condition',trigger_condition,'enforcement_type',enforcement_type,'enforcement_actor',enforcement_actor,'enforcement_direction',enforcement_direction),
        'confidence',coalesce(confidence,0),'confirmed',coalesce(signal_status,'') in ('confirmed','verified','accepted'),
        'metadata',jsonb_build_object('canon_version',canon_version,'signal_status',signal_status,'actor_canon_id',actor_canon_id)
      )
    from public.accountability_route
    union all
    select
      extraction_run_id,'override',id,
      jsonb_build_object(
        'layer','override','key',id,'source_object_type','entity_override','source_object_id',id,
        'source_block_id',source_block_id,'extraction_run_id',extraction_run_id::text,
        'normalized_value',jsonb_build_object('override_type',override_type,'overridden_authority',overridden_authority,'override_scope',override_scope,'override_condition',override_condition,'granting_actor',granting_actor,'effective_date',effective_date,'sunset_date',sunset_date,'temporal_status',temporal_status),
        'confidence',coalesce(confidence,0),'confirmed',coalesce(signal_status,'') in ('confirmed','verified','accepted'),
        'metadata',jsonb_build_object('canon_version',canon_version,'signal_status',signal_status,'actor_canon_id',actor_canon_id)
      )
    from public.entity_override
    union all
    select
      extraction_run_id,'definition',id,
      jsonb_build_object(
        'layer','definition','key',id,'source_object_type','term_definition','source_object_id',id,
        'source_block_id',source_block_id,'extraction_run_id',extraction_run_id::text,
        'normalized_value',jsonb_build_object('defined_term',defined_term,'defining_section',defining_section,'definition_text',definition_text,'definition_type',definition_type),
        'confidence',coalesce(confidence,0),'confirmed',coalesce(signal_status,'') in ('confirmed','verified','accepted'),
        'metadata',jsonb_build_object('canon_version',canon_version,'signal_status',signal_status)
      )
    from public.term_definition
  ) unified
  group by extraction_run_id
)
select
  rb.extraction_run_id,
  rb.source_document_id,
  rb.corpus_id,
  rb.document_name,
  rb.document_type,
  rb.document_identifier,
  rb.run_version,
  rb.run_status,
  rb.confidence_threshold,
  rb.created_at,
  rb.completed_at,
  coalesce(o.objects_json,'[]'::jsonb) as objects,
  coalesce(c.coverage_json,'{}'::jsonb) as coverage,
  case
    when rb.run_status in ('completed','verified','passed')
      and coalesce((select bool_and(value ->> 'status' = 'populated') from jsonb_each(coalesce(c.coverage_json,'{}'::jsonb))), false)
    then 'complete'
    when rb.run_status in ('failed','rejected') then 'failed'
    else 'partial'
  end as provenance_state
from run_base rb
left join coverage c on c.extraction_run_id = rb.extraction_run_id
left join objects o on o.extraction_run_id = rb.extraction_run_id

comment on view public.v_civic_genome_law_view_v1 is 'Deterministic, provenance-preserving Rosetta export contract for Civic Genome assembly. Five canonical layers only; no interpretation or inference.'
