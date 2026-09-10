-- REVIEWED EXECUTION PATH ONLY. This file intentionally contains no inferred
-- author mappings. Populate v_assertions only after comparing each assertion
-- with the exact source artifact and recording source offsets in source_refs.
-- It fails closed while the review set is empty and is not a migration.
begin;

do $review$
declare
  v_case_uuid uuid;
  v_session_id uuid;
  v_assertions jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  select bridge.case_uuid, link.intake_session_id
    into strict v_case_uuid, v_session_id
    from public.case_identity_bridge bridge
    join public.case_intake_links link on link.case_uuid = bridge.case_uuid
    join public.intake_sessions session on session.intake_session_id = link.intake_session_id
   where bridge.legacy_case_id = 11
     and link.is_primary = true
     and link.link_type = 'primary_projection'
     and session.session_type = 'live'
     and session.entry_channel = 'upload';

  if jsonb_array_length(v_assertions) = 0 then
    raise exception 'case 11 participant assertions require completed evidence review';
  end if;

  for v_item in select value from jsonb_array_elements(v_assertions)
  loop
    perform * from public.append_reviewed_intake_message_participant_assertion_v1(
      v_session_id,
      v_case_uuid,
      (v_item->>'artifact_id')::uuid,
      v_item->>'artifact_key',
      v_item->>'message_direction',
      v_item->>'source_contact_name',
      v_item->>'author_canonical_name',
      v_item->'evidence',
      v_item->>'provenance_ref',
      'verified',
      (v_item->>'reviewed_by')::integer,
      v_item->'review_receipt',
      nullif(v_item->>'supersedes_assertion_id', '')::uuid
    );
  end loop;
end
$review$;

-- Keep rollback until the reviewer verifies returned assertion identities and
-- reruns the sealed Intake Spine projection. Replace with COMMIT deliberately.
rollback;
