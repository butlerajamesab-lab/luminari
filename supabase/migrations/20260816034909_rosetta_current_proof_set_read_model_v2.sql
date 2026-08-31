begin

create index if not exists extraction_run_current_generation_gate_idx
  on public.extraction_run (
    engine_version,
    rule_set_version,
    rule_manifest_hash,
    source_document_id,
    id desc
  )
  where run_status in ('completed','validated')
    and admissibility_state='admissible'

create or replace function rosetta_private.rosetta_current_proof_run_ids_v1()
returns table(extraction_run_id integer)
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  with target as (
    select engine_version, rule_set_version, rule_manifest_hash, validation_test_name
    from public.rosetta_current_generation_registry_v1
    where singleton = true
  ),
  validated as materialized (
    select run.id, run.source_document_id
    from public.extraction_run run
    cross join target
    join public.validation_result validation
      on validation.extraction_run_id = run.id
     and validation.test_name = target.validation_test_name
     and validation.test_result = 'pass'
     and validation.failure_count = 0
    where run.run_status in ('completed','validated')
      and run.admissibility_state = 'admissible'
      and run.engine_version = target.engine_version
      and run.rule_set_version = target.rule_set_version
      and run.rule_manifest_hash = target.rule_manifest_hash
      and run.source_content_hash is not null
      and run.output_content_hash is not null
  ),
  repair_clean as materialized (
    select validated.*
    from validated
    where public.rosetta_blocking_structural_repair_count(validated.id) = 0
  ),
  latest as (
    select distinct on (source_document_id)
      id as extraction_run_id,
      source_document_id
    from repair_clean
    order by source_document_id, id desc
  ),
  terminal as (
    select latest.extraction_run_id
    from latest
    join public.layer_coverage coverage
      on coverage.extraction_run_id = latest.extraction_run_id
    group by latest.extraction_run_id
    having count(distinct coverage.layer_name) = 5
       and bool_and(coverage.coverage_status in ('populated','not_applicable'))
  )
  select terminal.extraction_run_id
  from terminal;
$$

revoke all on function rosetta_private.rosetta_current_proof_run_ids_v1() from public

create or replace function rosetta_private.rosetta_is_current_proof_run_v1(
  p_extraction_run_id integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  select exists (
    select 1
    from rosetta_private.rosetta_current_proof_run_ids_v1() proof
    where proof.extraction_run_id = p_extraction_run_id
  );
$$

create or replace function rosetta_private.rosetta_current_proof_summary_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  select jsonb_build_object(
    'contract', 'rosetta-current-proof-summary-v1',
    'production_run_count', count(*) filter (where document.document_type is distinct from 'test_control'),
    'control_receipt_count', count(*) filter (where document.document_type = 'test_control')
  )
  from rosetta_private.rosetta_current_proof_run_ids_v1() proof
  join public.extraction_run run on run.id = proof.extraction_run_id
  join public.source_document document on document.id = run.source_document_id;
$$

create or replace function rosetta_private.rosetta_run_proof_membership_v1(
  p_run_ids integer[]
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  with requested as (
    select distinct run_id
    from unnest(coalesce(p_run_ids, array[]::integer[])) as requested(run_id)
    where run_id is not null and run_id > 0
  ),
  proof as materialized (
    select extraction_run_id
    from rosetta_private.rosetta_current_proof_run_ids_v1()
  )
  select jsonb_build_object(
    'contract', 'rosetta-run-proof-membership-v1',
    'current_proof_run_ids', coalesce(
      jsonb_agg(requested.run_id order by requested.run_id)
        filter (where proof.extraction_run_id is not null),
      '[]'::jsonb
    )
  )
  from requested
  left join proof on proof.extraction_run_id = requested.run_id;
$$

create or replace function public.rosetta_multi_law_proof_v1(
  p_limit integer default 100,
  p_candidate_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, rosetta_private
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_limit, 100), 1), 100) as result_limit,
      least(
        greatest(
          coalesce(p_candidate_limit, 500),
          least(greatest(coalesce(p_limit, 100), 1), 100)
        ),
        500
      ) as candidate_limit
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
    from rosetta_private.rosetta_current_proof_run_ids_v1() proof
    join public.extraction_run er on er.id = proof.extraction_run_id
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
    join public.source_document sd on sd.id = cr.source_document_id
    left join public.source_document_content sdc on sdc.source_content_id = cr.source_content_id
    left join lateral (
      select jsonb_object_agg(
        lower(layer.layer_name),
        jsonb_build_object(
          'status', layer.coverage_status,
          'reason', layer.reason,
          'validated_at', layer.validated_at
        ) order by layer.layer_name
      ) as coverage_json
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
    order by cr.id desc
    limit (select result_limit from bounds)
  )
  select coalesce(
    jsonb_agg(to_jsonb(proof_rows) order by extraction_run_id desc),
    '[]'::jsonb
  )
  from proof_rows;
$$

comment on function rosetta_private.rosetta_current_proof_run_ids_v1() is
  'Set-based current-proof identity contract. Filters to the registry-selected generation before validation, repair, latest-generation, and terminal-coverage checks so Dashboard and Multi-Law Proof do not scan historical runs through a per-row proof predicate.'

commit
