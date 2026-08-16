begin;

create table if not exists public.civic_genome_rosetta_generation_target (
  target_name text primary key,
  contract text not null,
  engine_version text not null,
  rule_set_version text not null,
  rule_manifest_hash text not null check (rule_manifest_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_rosetta_generation_target_name check (target_name = 'current')
);

alter table public.civic_genome_rosetta_generation_target enable row level security;
revoke all on public.civic_genome_rosetta_generation_target from public, anon, authenticated;
grant select, insert, update on public.civic_genome_rosetta_generation_target to service_role;

create or replace view public.v_civic_genome_rosetta_generation_convergence_v1
with (security_invoker=true) as
with target as (
  select *
  from public.civic_genome_rosetta_generation_target
  where target_name='current'
),
ranked as (
  select version.*,
         row_number() over(
           partition by version.genome_bill_id
           order by version.stage_rank desc,
                    version.provider_sequence desc,
                    version.created_at desc,
                    version.bill_version_id desc
         ) rn
  from public.civic_genome_bill_version version
),
current_versions as (
  select *
  from ranked
  where rn=1
    and rosetta_source_document_id is not null
),
current_counts as (
  select
    count(*)::integer current_source_backed_versions,
    count(*) filter(where binding.source_document_id is null)::integer missing_binding_count,
    count(*) filter(
      where binding.rosetta_engine_version=target.engine_version
        and binding.rosetta_rule_set_version=target.rule_set_version
        and binding.rosetta_rule_manifest_hash=target.rule_manifest_hash
    )::integer current_generation_binding_count
  from current_versions current_version
  cross join target
  left join public.civic_genome_rosetta_source_binding binding
    on binding.source_document_id=current_version.rosetta_source_document_id
  group by target.engine_version,target.rule_set_version,target.rule_manifest_hash
),
queue_counts as (
  select
    count(*) filter(where queue.queue_state='eligible')::integer eligible_count,
    count(*) filter(where queue.queue_state='running')::integer running_count,
    count(*) filter(where queue.queue_state='retry')::integer retry_count,
    count(*) filter(where queue.queue_state='completed')::integer completed_count,
    count(*) filter(where queue.queue_state='dead_letter')::integer dead_letter_count
  from target
  left join public.civic_genome_rosetta_generation_upgrade_queue queue
    on queue.target_engine_version=target.engine_version
   and queue.target_rule_set_version=target.rule_set_version
   and queue.target_rule_manifest_hash is not distinct from target.rule_manifest_hash
)
select
  'civic-genome-rosetta-generation-convergence-v1'::text contract,
  target.engine_version target_engine_version,
  target.rule_set_version target_rule_set_version,
  target.rule_manifest_hash target_rule_manifest_hash,
  target.observed_at target_observed_at,
  coalesce(current_counts.current_source_backed_versions,0) current_source_backed_versions,
  coalesce(current_counts.current_generation_binding_count,0) current_generation_binding_count,
  coalesce(current_counts.missing_binding_count,0) missing_binding_count,
  coalesce(queue_counts.eligible_count,0) eligible_count,
  coalesce(queue_counts.running_count,0) running_count,
  coalesce(queue_counts.retry_count,0) retry_count,
  coalesce(queue_counts.completed_count,0) completed_count,
  coalesce(queue_counts.dead_letter_count,0) dead_letter_count,
  (
    coalesce(current_counts.current_source_backed_versions,0)>0
    and current_counts.current_generation_binding_count=current_counts.current_source_backed_versions
    and current_counts.missing_binding_count=0
    and coalesce(queue_counts.eligible_count,0)=0
    and coalesce(queue_counts.running_count,0)=0
    and coalesce(queue_counts.retry_count,0)=0
    and coalesce(queue_counts.dead_letter_count,0)=0
  ) converged
from target
left join current_counts on true
left join queue_counts on true;

revoke all on public.v_civic_genome_rosetta_generation_convergence_v1 from public,anon,authenticated;

comment on table public.civic_genome_rosetta_generation_target is
  'Latest Rosetta current-generation receipt actually observed by Lighthouse. No placeholder row is created; absence means the target has not been observed and convergence cannot be asserted.';
comment on view public.v_civic_genome_rosetta_generation_convergence_v1 is
  'Dynamic convergence receipt. Compares every current source-backed Civic Genome version and the durable upgrade queue against the latest current-generation receipt actually observed from Rosetta.';

commit;
