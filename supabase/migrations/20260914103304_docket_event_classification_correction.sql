-- Correct legacy Docket events created before procedural movement classification
-- was restricted to the provider's latest-action field. Preserve the original
-- type in the payload and append an explicit correction event so the ledger
-- remains auditable without continuing to export a false movement claim.
with corrected as (
  update public.civic_genome_event event
     set event_type = 'classification_superseded',
         event_payload_json = coalesce(event.event_payload_json, '{}'::jsonb)
           || jsonb_build_object(
                'classification_correction', jsonb_build_object(
                  'original_event_type', event.event_type,
                  'reason', 'legacy_subject_text_was_not_procedural_evidence',
                  'corrected_at', now()
                )
              )
   where event.event_type in ('amended', 'committee_action', 'passed_chamber', 'passed_two_chambers')
     and event.source_trace @> '[{"source_layer":"docket_room_cache"}]'::jsonb
     and case event.event_type
       when 'amended' then coalesce(event.event_payload_json ->> 'event_summary', '')
         !~* 'Latest action:.*(amend|engrossed|substitute|revised)'
       when 'committee_action' then coalesce(event.event_payload_json ->> 'event_summary', '')
         !~* 'Latest action:.*(committee|referred|reported)'
       when 'passed_chamber' then coalesce(event.event_payload_json ->> 'event_summary', '')
         !~* 'Latest action:.*(passed house|passed senate)'
       when 'passed_two_chambers' then coalesce(event.event_payload_json ->> 'event_summary', '')
         !~* 'Latest action:.*(passed house and senate|passed both)'
       else false
     end
  returning event.*
)
insert into public.civic_genome_event (
  family_id,
  genome_bill_id,
  bill_id,
  state_code,
  event_type,
  event_timestamp,
  prior_status,
  next_status,
  amendment_version,
  source_trace,
  event_payload_json
)
select
  corrected.family_id,
  corrected.genome_bill_id,
  corrected.bill_id,
  corrected.state_code,
  'docket_classification_corrected',
  now(),
  corrected.prior_status,
  corrected.next_status,
  corrected.amendment_version,
  corrected.source_trace,
  jsonb_build_object(
    'event_summary', 'Legacy Docket movement classification superseded because subject text is not procedural evidence.',
    'superseded_event_id', corrected.event_id,
    'original_event_type', corrected.event_payload_json #>> '{classification_correction,original_event_type}',
    'correction_reason', 'legacy_subject_text_was_not_procedural_evidence'
  )
from corrected;
