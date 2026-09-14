-- Append correction records for legacy terminal classifications that were not
-- supported by either the provider status or its latest procedural action.
-- Current readers resolve these pairs; original historical rows are untouched.
with invalid_terminal_event as (
  select event.*
  from public.civic_genome_event event
  where event.event_type in ('enacted', 'vetoed', 'failed')
    and event.source_trace @> '[{"source_layer":"docket_room_cache"}]'::jsonb
    and not exists (
      select 1
      from public.civic_genome_event correction
      where correction.event_type = 'docket_classification_corrected'
        and correction.event_payload_json ->> 'superseded_event_id' = event.event_id::text
    )
    and case event.event_type
      when 'enacted' then
        coalesce(event.event_payload_json ->> 'event_summary', '')
          !~* 'Latest action:.*(^|[[:space:]])(effective date|chapter(ed)?|enacted|signed by governor|governor signed|became law|bill (has )?enacted|measure (has )?enacted|resolution (has )?enacted)'
      when 'vetoed' then
        coalesce(event.next_status, '') <> 'legiscan_status_5'
        and coalesce(event.event_payload_json ->> 'event_summary', '')
          !~* 'Latest action:.*(^|[[:space:]])(vetoed|bill (has )?vetoed|measure (has )?vetoed|resolution (has )?vetoed)'
      when 'failed' then
        coalesce(event.next_status, '') <> 'legiscan_status_6'
        and coalesce(event.event_payload_json ->> 'event_summary', '')
          !~* 'Latest action:.*(^|[[:space:]])(failed|withdrawn|dead|postponed indefinitely|bill (has )?(failed|withdrawn|died|been postponed indefinitely)|measure (has )?(failed|withdrawn|died|been postponed indefinitely)|resolution (has )?(failed|withdrawn|died|been postponed indefinitely))'
      else false
    end
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
    'event_summary', 'Legacy Docket terminal classification superseded because subject text is not procedural evidence.',
    'superseded_event_id', event.event_id,
    'original_event_type', event.event_type,
    'correction_reason', 'legacy_subject_text_was_not_procedural_evidence'
  )
from invalid_terminal_event event;
