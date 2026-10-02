-- Quota-safe Docket authority for the LegiScan 10k/month public API.
--
-- A current master-list observation is a bounded 100-bill window. If the exact
-- bill summary fingerprint is unchanged, its already-completed bill-detail
-- generation remains valid; a newer cache timestamp alone must not spend
-- another getBill request.

-- The September 30 live-observation trigger deliberately reopened every
-- unchanged completed bill generation on each cache refresh. Changed
-- fingerprints already create distinct queue generations, so unchanged
-- completed generations must remain terminal. Keep the existing trigger name
-- only as a narrow rehabilitation hook for rows that were incorrectly made
-- permanent by shared provider capacity/rate failures.
drop trigger if exists docket_bill_live_observation_rearm_v1
  on public.docket_jurisdiction_activation_bill;

create or replace function public.rearm_docket_bill_detail_on_live_observation_v1()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
begin
  update public.docket_bill_processing_queue q
     set queue_state = 'degraded',
         attempt_count = 0,
         next_attempt_at = greatest(
           now(),
           date_trunc('month', q.updated_at) + interval '1 month 5 minutes'
         ),
         completed_at = null,
         locked_at = null,
         locked_by = null,
         last_failure_class = 'transient',
         receipt_json = coalesce(q.receipt_json, '{}'::jsonb)
           || jsonb_build_object(
                'legiscan_provider_capacity_reclassification_v1',
                jsonb_build_object(
                  'prior_queue_state', q.queue_state,
                  'prior_attempt_count', q.attempt_count,
                  'provider_error_code', q.last_error_code,
                  'activation_id', new.activation_id,
                  'state', new.state,
                  'session_id', new.session_id,
                  'source_bill_id', new.source_bill_id,
                  'reclassified_at', now()
                )
              ),
         updated_at = now()
   where q.queue_id = new.queue_id
     and q.queue_state = 'permanent_failure'
     and (
       q.last_error_code like 'legiscan_http_429_while_calling_%'
       or q.last_error_code like 'legiscan_shared_api_error_while_calling_%'
     )
     and q.locked_at is null
     and q.locked_by is null;

  return new;
end;
$function$;

revoke all on function public.rearm_docket_bill_detail_on_live_observation_v1()
  from public, anon, authenticated;

create trigger docket_bill_live_observation_rearm_v1
after insert on public.docket_jurisdiction_activation_bill
for each row
execute function public.rearm_docket_bill_detail_on_live_observation_v1();

create or replace view public.docket_current_authoritative_source_v1
with (security_invoker = true)
as
with current_activation as materialized (
  select
    activation.activation_id,
    activation.state,
    activation.session_id,
    activation.cache_fetched_at,
    binding.queue_id,
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
  join public.docket_bill_processing_queue queue
    on queue.queue_id = binding.queue_id
   and queue.source_bill_id = binding.source_bill_id
   and queue.queue_state = 'completed'
  where cache.fetched_at >= now() - interval '24 hours'
    and extract(year from cache.fetched_at at time zone 'UTC')
        = extract(year from current_timestamp at time zone 'UTC')
    and exists (
      select 1
      from jsonb_array_elements(cache.bills)
        with ordinality as current_bill(value, ordinality)
      where current_bill.ordinality <= 100
        and coalesce(current_bill.value ->> 'bill_id', '') ~ '^[0-9]+$'
        and (current_bill.value ->> 'bill_id')::integer = binding.source_bill_id
    )
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
  join public.docket_bill_processing_queue queue
    on queue.queue_id = current.queue_id
   and queue.source_bill_id = current.source_bill_id
   and queue.queue_state = 'completed'
  join public.docket_bill_detail_cache detail
    on detail.bill_id = current.source_bill_id
   and detail.fetched_at >= queue.created_at
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
  'Docket live authority for the current 100-bill jurisdiction window. Unchanged summary generations reuse their completed detail receipt; historical versions remain preserved but are not current.';

-- Repair only currently visible top-100 generations that were made
-- permanent by the provider's shared/rate-limit state. Their prior terminal
-- classification is retained in the appended receipt before the retry counter
-- is reset. Rows outside the current cached window remain historical.
with current_provider_failures as materialized (
  select distinct queue.queue_id
  from public.docket_bill_state_cache cache
  join public.docket_jurisdiction_activation_run activation
    on activation.state = cache.state
   and activation.session_id = cache.session_id
   and activation.cache_fetched_at = cache.fetched_at
  join public.docket_jurisdiction_activation_bill binding
    on binding.activation_id = activation.activation_id
   and binding.state = activation.state
   and binding.session_id = activation.session_id
  join public.docket_bill_processing_queue queue
    on queue.queue_id = binding.queue_id
   and queue.source_bill_id = binding.source_bill_id
  where queue.queue_state = 'permanent_failure'
    and (
      queue.last_error_code like 'legiscan_http_429_while_calling_%'
      or queue.last_error_code like 'legiscan_shared_api_error_while_calling_%'
    )
    and exists (
      select 1
      from jsonb_array_elements(cache.bills)
        with ordinality as current_bill(value, ordinality)
      where current_bill.ordinality <= 100
        and coalesce(current_bill.value ->> 'bill_id', '') ~ '^[0-9]+$'\n        and (current_bill.value ->> 'bill_id')::integer = binding.source_bill_id
    )
)
update public.docket_bill_processing_queue queue
   set queue_state = 'degraded',
       attempt_count = 0,
       next_attempt_at = greatest(
         now(),
         date_trunc('month', queue.updated_at) + interval '1 month 5 minutes'
       ),
       completed_at = null,
       locked_at = null,
       locked_by = null,
       last_failure_class = 'transient',
       receipt_json = coalesce(queue.receipt_json, '{}'::jsonb)
         || jsonb_build_object(
              'legiscan_provider_capacity_reclassification_v1',
              jsonb_build_object(
                'prior_queue_state', queue.queue_state,
                'prior_attempt_count', queue.attempt_count,
                'provider_error_code', queue.last_error_code,
                'reclassified_at', now()
              )
            ),
       updated_at = now()
  from current_provider_failures current
 where queue.queue_id = current.queue_id
   and queue.locked_at is null
   and queue.locked_by is null;

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
