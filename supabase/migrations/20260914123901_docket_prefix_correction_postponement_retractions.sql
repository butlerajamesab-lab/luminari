begin;

-- Retract prefix-subsidiary corrections when the same provider action also
-- explicitly postpones the whole bill, measure, or resolution indefinitely.
with invalid_correction as (
  select correction.*
  from public.civic_genome_event correction
  join public.civic_genome_event original
    on original.event_id::text =
       correction.event_payload_json ->> 'superseded_event_id'
  where correction.event_type = 'docket_classification_corrected'
    and correction.event_payload_json ->> 'correction_reason' =
        'legacy_prefix_subsidiary_failure_was_not_whole_measure_disposition'
    and coalesce(original.event_payload_json ->> 'event_summary', '') ~*
      'Latest action:.*\y(bill|measure|resolution)\y[[:space:]]+(has[[:space:]]+)?(((been[[:space:]]+)?postponed[[:space:]]+indefinitely)|indefinitely[[:space:]]+postponed)\y'
    and not exists (
      select 1
      from public.civic_genome_event retraction
      where retraction.event_type =
          'docket_classification_correction_retracted'
        and retraction.event_payload_json ->
            'retracted_correction_event_id' is not null
        and retraction.event_payload_json ->
            'retracted_correction_event_id' =
            to_jsonb(correction.event_id)
    )
)
insert into public.civic_genome_event (
  family_id, genome_bill_id, bill_id, state_code, event_type, event_timestamp,
  prior_status, next_status, amendment_version, source_trace, event_payload_json
)
select
  correction.family_id, correction.genome_bill_id, correction.bill_id,
  correction.state_code, 'docket_classification_correction_retracted', now(),
  correction.prior_status, correction.next_status,
  correction.amendment_version, correction.source_trace,
  jsonb_build_object(
    'event_summary', 'Prefix-subsidiary correction retracted because the same action explicitly postpones the whole measure.',
    'retracted_correction_event_id', correction.event_id,
    'restored_event_id', correction.event_payload_json ->> 'superseded_event_id',
    'retraction_reason', 'explicit_whole_measure_postponement_in_same_action'
  )
from invalid_correction correction;

commit;
