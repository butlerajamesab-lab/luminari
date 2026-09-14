-- Append correction partners for legacy false terminal events whose recorded
-- latest action disposed only of a subsidiary amendment or motion.
with invalid_subsidiary_terminal_event as (
  select event.*
  from public.civic_genome_event event
  where event.event_type in ('failed', 'vetoed')
    and event.source_trace @> '[{"source_layer":"docket_room_cache"}]'::jsonb
    and coalesce(event.next_status, '') not in ('legiscan_status_5', 'legiscan_status_6')
    and coalesce(event.event_payload_json ->> 'event_summary', '')
      ~* 'Latest action:[[:space:]]*(amendment|motion)[[:space:]]+(failed|withdrawn|dead|vetoed|postponed indefinitely)'
    and not exists (
      select 1
      from public.civic_genome_event correction
      where correction.event_type = 'docket_classification_corrected'
        and correction.event_payload_json ->> 'superseded_event_id' = event.event_id::text
    )
)
insert into public.civic_genome_event (
  family_id, genome_bill_id, bill_id, state_code, event_type, event_timestamp,
  prior_status, next_status, amendment_version, source_trace, event_payload_json
)
select
  event.family_id,
  event.genome_bill_id,
  event.bill_id,
  event.state_code,
  'docket_classification_corrected',
  now(),
  event.prior_status,
  event.next_status,
  event.amendment_version,
  event.source_trace,
  jsonb_build_object(
    'event_summary', 'Legacy Docket terminal classification superseded because the latest action disposed only of a subsidiary action.',
    'superseded_event_id', event.event_id,
    'original_event_type', event.event_type,
    'correction_reason', 'legacy_subsidiary_action_was_not_whole_measure_disposition'
  )
from invalid_subsidiary_terminal_event event;
