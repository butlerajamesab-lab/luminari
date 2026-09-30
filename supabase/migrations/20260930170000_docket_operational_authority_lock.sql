-- Docket is the sole upstream authority for operational "current" source identity.
-- Historical bill versions remain registered for audit/parser access but are not
-- eligible for the live operational lane.

create or replace function public.rearm_docket_bill_detail_on_live_observation_v1()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
begin
  -- A new Docket activation is a new observation even when the provider summary
  -- fingerprint is unchanged. Re-fetch detail so new text/amendment identities
  -- cannot be hidden behind an old completed queue row.
  update public.docket_bill_processing_queue q
     set queue_state = 'eligible',
         attempt_count = 0,
         next_attempt_at = now(),
         completed_at = null,
         last_failure_class = null,
         last_error_code = null,
         receipt_json = coalesce(q.receipt_json, '{}'::jsonb)
           || jsonb_build_object(
                'docket_live_reobservation_v1',
                jsonb_build_object(
                  'activation_id', new.activation_id,
                  'state', new.state,
                  'session_id', new.session_id,
                  'source_bill_id', new.source_bill_id,
                  'rearmed_at', now()
                )
              ),
         updated_at = now()
   where q.queue_id = new.queue_id
     and q.locked_at is null
     and q.locked_by is null;

  return new;
end;
$function$;

revoke all on function public.rearm_docket_bill_detail_on_live_observation_v1()
  from public, anon, authenticated;

drop trigger if exists docket_bill_live_observation_rearm_v1
  on public.docket_jurisdiction_activation_bill;

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
ranked as (
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
    row_number() over (
      partition by document.source_bill_id
      order by
        document.stage_rank desc nulls last,
        document.provider_sequence desc nulls last,
        document.provider_document_id desc,
        document.source_document_key desc
    ) as authority_rank
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
)
select
  'lighthouse-docket-operational-authority-v1'::text as contract,
  ranked.activation_id,
  ranked.state,
  ranked.session_id,
  ranked.cache_fetched_at,
  ranked.docket_detail_fetched_at,
  ranked.source_bill_id,
  ranked.source_document_key,
  ranked.provider_document_id,
  ranked.document_family,
  ranked.provider_document_type,
  ranked.normalized_version_type,
  ranked.provider_sequence,
  ranked.stage_rank,
  ranked.source_url,
  ranked.provider_url,
  ranked.provider_hash,
  ranked.provider_size,
  ranked.provider_date,
  ranked.latest_observed_at,
  ranked.bill_version_id,
  ranked.genome_bill_id,
  encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'contract', 'lighthouse-docket-operational-authority-v1',
          'activation_id', ranked.activation_id,
          'state', ranked.state,
          'session_id', ranked.session_id,
          'cache_fetched_at', ranked.cache_fetched_at,
          'docket_detail_fetched_at', ranked.docket_detail_fetched_at,
          'source_bill_id', ranked.source_bill_id,
          'source_document_key', ranked.source_document_key,
          'provider_document_id', ranked.provider_document_id,
          'provider_hash', ranked.provider_hash,
          'provider_date', ranked.provider_date
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) as authority_sha256
from ranked
where ranked.authority_rank = 1;

revoke all on public.docket_current_authoritative_source_v1
  from public, anon, authenticated;
grant select on public.docket_current_authoritative_source_v1 to service_role;

comment on view public.docket_current_authoritative_source_v1 is
  'Docket-owned live authority projection. One current text identity per bill, only after a fresh current-session activation and matching detail observation. Historical versions are excluded from operational eligibility.';
