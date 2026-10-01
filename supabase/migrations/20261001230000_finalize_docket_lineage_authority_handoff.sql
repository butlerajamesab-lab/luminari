-- Forward-only completion of the Docket -> Civic Genome lineage authority handoff.
-- Earlier branch migrations were already applied to the Supabase preview before
-- their source was corrected. Do not rewrite those applied migrations; install
-- the final authority definition and trigger behavior as a new migration.

create or replace view public.docket_current_authoritative_source_v1
with (security_invoker = true)
as
with current_activation as materialized (
  select
    activation.activation_id,
    activation.state,
    activation.session_id,
    activation.cache_fetched_at,
    binding.source_bill_id
  from public.docket_bill_state_cache cache
  join public.docket_jurisdiction_activation_run activation
    on activation.state = cache.state
   and activation.session_id = cache.session_id
   and activation.cache_fetched_at = cache.fetched_at
  join public.docket_jurisdiction_activation_bill binding
    on binding.activation_id = activation.activation_id
   and binding.state = activation.state
   and binding.session_id = activation.session_id
  where cache.fetched_at >= now() - interval '8 hours'
    and extract(year from cache.fetched_at at time zone 'UTC')
        = extract(year from current_timestamp at time zone 'UTC')
),
eligible as materialized (
  select
    current.activation_id,
    current.state,
    current.session_id,
    current.cache_fetched_at,
    detail.fetched_at as docket_detail_fetched_at,
    document.source_bill_id,
    document.source_document_key,
    document.provider_document_id,
    document.document_family,
    document.provider_document_type,
    document.normalized_version_type,
    document.provider_sequence,
    document.stage_rank,
    document.source_url,
    document.provider_url,
    document.provider_hash,
    document.provider_size,
    document.provider_date,
    document.latest_observed_at,
    version.bill_version_id,
    version.genome_bill_id,
    version.predecessor_bill_version_id
  from current_activation current
  join public.docket_bill_detail_cache detail
    on detail.bill_id = current.source_bill_id
   and detail.fetched_at >= current.cache_fetched_at
  join public.docket_bill_source_document document
    on document.source_bill_id = current.source_bill_id
   and document.document_family = 'text'
   and document.latest_observed_at = detail.fetched_at
  join public.civic_genome_bill_version version
    on version.source_bill_id = document.source_bill_id
   and version.source_document_key = document.source_document_key
   and version.document_family = 'text'
),
lineage_leaf as (
  select candidate.*
  from eligible candidate
  where not exists (
    select 1
    from public.civic_genome_bill_version successor
    where successor.predecessor_bill_version_id = candidate.bill_version_id
      and successor.genome_bill_id = candidate.genome_bill_id
      and successor.document_family = 'text'
  )
)
select
  'lighthouse-docket-operational-authority-v1'::text as contract,
  leaf.activation_id,
  leaf.state,
  leaf.session_id,
  leaf.cache_fetched_at,
  leaf.docket_detail_fetched_at,
  leaf.source_bill_id,
  leaf.source_document_key,
  leaf.provider_document_id,
  leaf.document_family,
  leaf.provider_document_type,
  leaf.normalized_version_type,
  leaf.provider_sequence,
  leaf.stage_rank,
  leaf.source_url,
  leaf.provider_url,
  leaf.provider_hash,
  leaf.provider_size,
  leaf.provider_date,
  leaf.latest_observed_at,
  leaf.bill_version_id,
  leaf.genome_bill_id,
  encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'contract', 'lighthouse-docket-operational-authority-v1',
          'activation_id', leaf.activation_id,
          'state', leaf.state,
          'session_id', leaf.session_id,
          'cache_fetched_at', leaf.cache_fetched_at,
          'docket_detail_fetched_at', leaf.docket_detail_fetched_at,
          'source_bill_id', leaf.source_bill_id,
          'source_document_key', leaf.source_document_key,
          'provider_document_id', leaf.provider_document_id,
          'provider_hash', leaf.provider_hash,
          'provider_date', leaf.provider_date
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as authority_sha256
from lineage_leaf leaf;

revoke all on public.docket_current_authoritative_source_v1
  from public, anon, authenticated;
grant select on public.docket_current_authoritative_source_v1 to service_role;

comment on view public.docket_current_authoritative_source_v1 is
  'Docket-owned live authority projection resolved by the full Civic Genome predecessor graph. Current Docket observation filters candidate leaves only; stage-rank ordering is not authority.';

drop trigger if exists enqueue_docket_current_authoritative_version_v1
  on public.civic_genome_bill_version;

create trigger enqueue_docket_current_authoritative_version_v1
after insert or update of version_fingerprint, provider_sequence, stage_rank, predecessor_bill_version_id
on public.civic_genome_bill_version
for each row
execute function public.enqueue_docket_current_authoritative_version_v1();

-- Re-arm only the exact current leaves selected by the corrected authority view.
-- Historical versions remain registered but are not made operational current.
update public.civic_genome_legislative_version_queue queue
   set queue_state='eligible',
       attempt_count=0,
       next_attempt_at=now(),
       completed_at=null,
       locked_at=null,
       locked_by=null,
       last_failure_class=null,
       last_error_code=null,
       updated_at=now()
  from public.docket_current_authoritative_source_v1 authority
 where queue.bill_version_id=authority.bill_version_id
   and queue.locked_at is null
   and queue.locked_by is null;
