-- Retract (without deleting) a subsidiary-action correction if the same latest
-- action also contains explicit whole-measure disposition evidence.
with invalid_correction as (
  select correction.*, original.event_payload_json as original_payload
  from public.civic_genome_event correction
  join public.civic_genome_event original
    on original.event_id::text = correction.event_payload_json ->> 'superseded_event_id'
  where correction.event_type = 'docket_classification_corrected'
    and correction.event_payload_json ->> 'correction_reason' =
        'legacy_subsidiary_action_was_not_whole_measure_disposition'
    and coalesce(original.event_payload_json ->> 'event_summary', '')
      ~* 'Latest action:.*\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(failed|withdrawn|vetoed|died|((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\y'
    and not exists (
      select 1
      from public.civic_genome_event existing_retraction
      where existing_retraction.event_type = 'docket_classification_correction_retracted'
        and existing_retraction.event_payload_json ->> 'retracted_correction_event_id' = correction.event_id::text
    )
)
insert into public.civic_genome_event (
  family_id, genome_bill_id, bill_id, state_code, event_type, event_timestamp,
  prior_status, next_status, amendment_version, source_trace, event_payload_json
)
select
  correction.family_id,
  correction.genome_bill_id,
  correction.bill_id,
  correction.state_code,
  'docket_classification_correction_retracted',
  now(),
  correction.prior_status,
  correction.next_status,
  correction.amendment_version,
  correction.source_trace,
  jsonb_build_object(
    'event_summary', 'Subsidiary-action correction retracted because the same source action explicitly disposes of the whole measure.',
    'retracted_correction_event_id', correction.event_id,
    'restored_event_id', correction.event_payload_json ->> 'superseded_event_id',
    'retraction_reason', 'explicit_whole_measure_disposition_in_same_action'
  )
from invalid_correction correction;
