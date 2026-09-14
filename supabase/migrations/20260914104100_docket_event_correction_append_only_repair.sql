-- Restore the immutable historical event rows touched by the preceding
-- correction and retain the appended correction events as the sole record of
-- supersession. Current/as-of readers resolve the pair using correction time.
update public.civic_genome_event event
   set event_type = event.event_payload_json #>> '{classification_correction,original_event_type}',
       event_payload_json = event.event_payload_json - 'classification_correction'
 where event.event_type = 'classification_superseded'
   and event.event_payload_json #>> '{classification_correction,reason}' =
       'legacy_subject_text_was_not_procedural_evidence'
   and event.event_payload_json #>> '{classification_correction,original_event_type}'
       in ('amended', 'committee_action', 'passed_chamber', 'passed_two_chambers');
