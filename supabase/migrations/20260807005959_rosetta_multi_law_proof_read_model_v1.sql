create or replace function public.rosetta_multi_law_proof_v1(
  p_limit integer default 100,
  p_candidate_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_limit, 100), 1), 100) as result_limit,
      least(greatest(coalesce(p_candidate_limit, 500), least(greatest(coalesce(p_limit, 100), 1), 100)), 500) as candidate_limit
  ),
  candidate_runs as materialized (
    select
      er.id,
      er.source_document_id,
      er.source_content_id,
      er.run_version,
      er.run_status,
      er.completed_at,
      er.engine_version,
      er.rule_set_version,
      er.rule_manifest_hash,
      er.configuration_hash,
      er.source_identity_hash,
      er.source_content_hash,
      er.output_content_hash,
      er.admissibility_state
    from public.extraction_run er
    cross join bounds b
    order by er.id desc
    limit (select candidate_limit from bounds)
  ),
  proof_rows as (
    select
      cr.id as extraction_run_id,
      cr.source_document_id,
      sd.corpus_id,
      sd.document_name,
      sd.document_type,
      sd.document_identifier,
      cr.run_version,
      cr.run_status,
      cr.completed_at,
      coalesce(cov.coverage_json, '{}'::jsonb) as coverage,
      'complete'::text as provenance_state,
      cr.engine_version,
      cr.rule_set_version,
      cr.rule_manifest_hash,
      cr.configuration_hash,
      cr.source_identity_hash,
      cr.source_content_hash,
      cr.output_content_hash,
      cr.admissibility_state,
      sdc.source_url,
      sdc.source_version,
      sdc.media_type,
      sdc.source_byte_hash,
      coalesce(obj.object_count, 0) as object_count,
      true as five_layer_terminal
    from candidate_runs cr
    join public.source_document sd
      on sd.id = cr.source_document_id
    left join public.source_document_content sdc
      on sdc.source_content_id = cr.source_content_id
    left join lateral (
      select
        jsonb_object_agg(
          lower(layer.layer_name),
          jsonb_build_object(
            'status', layer.coverage_status,
            'reason', layer.reason,
            'validated_at', layer.validated_at
          )
          order by layer.layer_name
        ) as coverage_json,
        count(*) as layer_count,
        bool_and(layer.coverage_status in ('populated', 'not_applicable'))
          and count(*) = 5 as terminal
      from (
        select
          lc.layer_name,
          case
            when bool_or(lc.coverage_status = 'extraction_failed') then 'extraction_failed'
            when bool_or(lc.coverage_status = 'pending_extraction') then 'pending_extraction'
            when bool_or(lc.coverage_status = 'populated') then 'populated'
            else 'not_applicable'
          end as coverage_status,
          string_agg(distinct lc.reason, ' | ' order by lc.reason)
            filter (where lc.reason is not null) as reason,
          max(lc.validated_at) as validated_at
        from public.layer_coverage lc
        where lc.extraction_run_id = cr.id
        group by lc.layer_name
      ) layer
    ) cov on true
    left join lateral (
      select
        (select count(*) from public.help_entity h where h.extraction_run_id = cr.id)
        + (select count(*) from public.workflow_pipeline w where w.extraction_run_id = cr.id)
        + (select count(*) from public.accountability_route a where a.extraction_run_id = cr.id)
        + (select count(*) from public.entity_override o where o.extraction_run_id = cr.id)
        + (select count(*) from public.term_definition d where d.extraction_run_id = cr.id)
        as object_count
    ) obj on true
    where cr.run_status in ('completed', 'validated')
      and cr.admissibility_state = 'admissible'
      and cr.engine_version is not null
      and cr.rule_set_version is not null
      and cr.rule_manifest_hash is not null
      and cr.source_content_hash is not null
      and cr.output_content_hash is not null
      and cov.terminal
    order by cr.id desc
    limit (select result_limit from bounds)
  )
  select coalesce(jsonb_agg(to_jsonb(proof_rows) order by extraction_run_id desc), '[]'::jsonb)
  from proof_rows;
$$

revoke all on function public.rosetta_multi_law_proof_v1(integer, integer)
  from public, anon, authenticated

grant execute on function public.rosetta_multi_law_proof_v1(integer, integer)
  to service_role

comment on function public.rosetta_multi_law_proof_v1(integer, integer) is
  'Rosetta read-only multi-law proof projection. Bounds candidate runs before indexed coverage/object aggregation; preserves five-layer terminal and admissibility contracts without materializing canonical object payloads.'
