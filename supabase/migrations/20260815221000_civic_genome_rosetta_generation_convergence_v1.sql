begin;

create or replace view public.v_civic_genome_rosetta_generation_convergence_v1
with (security_invoker = true)
as
with ranked as (
  select version.*,
         row_number() over (
           partition by version.genome_bill_id
           order by version.stage_rank desc,
                    version.provider_sequence desc,
                    version.created_at desc,
                    version.bill_version_id desc
         ) as rn
  from public.civic_genome_bill_version version
), current_versions as (
  select *
  from ranked
  where rn = 1
    and rosetta_source_document_id is not null
), current_counts as (
  select
    count(*)::integer as current_source_backed_versions,
    count(*) filter (
      where binding.source_document_id is null
    )::integer as missing_binding_count,
    count(*) filter (
      where binding.rosetta_engine_version = 'rosetta-v3-deterministic-sql-2.5.3'
        and binding.rosetta_rule_set_version = 'rosetta-five-layer-structural-correctness-2.5.3'
    )::integer as current_generation_binding_count
  from current_versions current_version
  left join public.civic_genome_rosetta_source_binding binding
    on binding.source_document_id = current_version.rosetta_source_document_id
), queue_counts as (
  select
    count(*) filter (where queue_state = 'eligible')::integer as eligible_count,
    count(*) filter (where queue_state = 'running')::integer as running_count,
    count(*) filter (where queue_state = 'retry')::integer as retry_count,
    count(*) filter (where queue_state = 'completed')::integer as completed_count,
    count(*) filter (where queue_state = 'dead_letter')::integer as dead_letter_count
  from public.civic_genome_rosetta_generation_upgrade_queue
  where target_engine_version = 'rosetta-v3-deterministic-sql-2.5.3'
    and target_rule_set_version = 'rosetta-five-layer-structural-correctness-2.5.3'
)
select
  'civic-genome-rosetta-generation-convergence-v1'::text as contract,
  'rosetta-v3-deterministic-sql-2.5.3'::text as target_engine_version,
  'rosetta-five-layer-structural-correctness-2.5.3'::text as target_rule_set_version,
  current_counts.current_source_backed_versions,
  current_counts.current_generation_binding_count,
  current_counts.missing_binding_count,
  queue_counts.eligible_count,
  queue_counts.running_count,
  queue_counts.retry_count,
  queue_counts.completed_count,
  queue_counts.dead_letter_count,
  (
    current_counts.current_source_backed_versions > 0
    and current_counts.current_generation_binding_count = current_counts.current_source_backed_versions
    and current_counts.missing_binding_count = 0
    and queue_counts.eligible_count = 0
    and queue_counts.running_count = 0
    and queue_counts.retry_count = 0
    and queue_counts.dead_letter_count = 0
  ) as converged
from current_counts
cross join queue_counts;

revoke all on public.v_civic_genome_rosetta_generation_convergence_v1
  from public, anon, authenticated;

comment on view public.v_civic_genome_rosetta_generation_convergence_v1 is
  'Read-only convergence receipt for the current Civic Genome to Rosetta generation boundary. Converged means every current source-backed bill is bound to Rosetta 2.5.3 and the 2.5.3 upgrade queue has no active, retrying, or dead-letter work.';

commit;
