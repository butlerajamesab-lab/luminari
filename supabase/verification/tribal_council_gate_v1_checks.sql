-- Behaviour checks for tribal_council_gate v1. Runs inside one transaction
-- and rolls back, so it leaves nothing behind. Every check raises on failure.
-- Expects the nations' seed fields to be loaded (scripts/tribal-council-gate-seed-import.mts).
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/verification/tribal_council_gate_v1_checks.sql
begin;

create temp table gate_check_result (check_name text, passed boolean);

do $$
declare
  v_reviewer bigint;
  v_approver bigint;
  v_field bigint;
  v_other_field bigint;
  v_new_field bigint;
  v_contact bigint;
  v_letter bigint;
  v_count integer;
  v_failed boolean;
  v_section text;
begin
  -- 1. A freshly loaded page shows nothing publicly.
  select count(*) into v_count from public.tribal_council_gate_public_field_v1;
  if v_count <> 0 then raise exception 'check 1: % public rows before any council decision', v_count; end if;
  insert into gate_check_result values ('nothing_public_before_council', true);

  insert into tribal_council_gate.council_member (nation_key, auth_user_id, display_name, member_role, granted_by, granted_basis)
  values ('self:chinook', gen_random_uuid(), 'reviewer pseudonym', 'council_reviewer', 'check', 'check')
  returning member_id into v_reviewer;
  insert into tribal_council_gate.council_member (nation_key, auth_user_id, display_name, member_role, granted_by, granted_basis)
  values ('self:chinook', gen_random_uuid(), 'approver pseudonym', 'council_approver', 'check', 'check')
  returning member_id into v_approver;

  select field_id, section_key into v_field, v_section from tribal_council_gate.field
   where nation_key = 'self:chinook' and field_key = 'tribe_self_name';
  select field_id into v_other_field from tribal_council_gate.field
   where nation_key = 'self:chinook' and section_key = v_section and field_id <> v_field
   order by display_order limit 1;

  -- 2. A reviewer cannot open a section to the public.
  v_failed := false;
  begin
    perform tribal_council_gate.record_council_decision('self:chinook', 'unlock_section', v_section, null, '{}', v_reviewer, null, 'check');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'check 2: reviewer unlocked a section'; end if;
  insert into gate_check_result values ('reviewer_cannot_unlock', true);

  -- 3. A Chinook member cannot decide anything for another nation.
  v_failed := false;
  begin
    perform tribal_council_gate.record_council_decision('self:duwamish', 'lock_section', 'identity_core', null, '{}', v_approver, null, 'check');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'check 3: member decided for another nation'; end if;
  insert into gate_check_result values ('access_scoped_to_own_nation', true);

  -- 4. Public display cannot be granted on a locked section.
  v_failed := false;
  begin
    perform tribal_council_gate.record_council_decision('self:chinook', 'grant_public_display', v_section, null, '{}', v_approver, null, 'check');
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'check 4: public display granted on a locked section'; end if;
  insert into gate_check_result values ('public_requires_unlock', true);

  -- 5. Confirm one field, unlock and publish the section: only that field shows.
  perform tribal_council_gate.record_council_decision('self:chinook', 'confirm_field', null, v_field, '{}', v_reviewer, null, 'check');
  perform tribal_council_gate.record_council_decision('self:chinook', 'unlock_section', v_section, null, '{}', v_approver, null, 'check');
  perform tribal_council_gate.record_council_decision('self:chinook', 'grant_public_display', v_section, null, '{}', v_approver, null, 'check');
  select count(*) into v_count from public.tribal_council_gate_public_field_v1;
  if v_count <> 1 then raise exception 'check 5: expected 1 public field, got %', v_count; end if;
  insert into gate_check_result values ('only_confirmed_fields_public', true);

  -- 6. A correction replaces the shown words with the council's own.
  perform tribal_council_gate.record_council_decision('self:chinook', 'correct_field', null, v_field,
    '{"value_text": "council wording"}', v_reviewer, null, 'check');
  select superseded_by into v_new_field from tribal_council_gate.field where field_id = v_field;
  if v_new_field is null then raise exception 'check 6: corrected field not superseded'; end if;
  if not exists (select 1 from public.tribal_council_gate_public_field_v1
                  where value_text = 'council wording' and source_posture = 'council_authored') then
    raise exception 'check 6: correction not shown as council_authored';
  end if;
  if exists (select 1 from public.tribal_council_gate_public_field_v1 where value_text = 'Chinook Indian Nation') then
    raise exception 'check 6: superseded words still public';
  end if;
  insert into gate_check_result values ('correction_supersedes', true);

  -- 7. Restricting a field removes it from public view.
  perform tribal_council_gate.record_council_decision('self:chinook', 'restrict_field', null, v_new_field, '{}', v_reviewer, null, 'check');
  select count(*) into v_count from public.tribal_council_gate_public_field_v1;
  if v_count <> 0 then raise exception 'check 7: restricted field still public'; end if;
  insert into gate_check_result values ('restrict_hides', true);

  -- 8. The council can add its own section and words; they go public only once opened.
  perform tribal_council_gate.record_council_decision('self:chinook', 'add_section', 'canoe_journey', null,
    '{"title": "Canoe Journey"}', v_approver, null, 'check');
  perform tribal_council_gate.record_council_decision('self:chinook', 'add_field', 'canoe_journey', null,
    '{"field_key": "council_statement", "value_text": "words the council wrote"}', v_approver, null, 'check');
  if exists (select 1 from public.tribal_council_gate_public_field_v1 where section_key = 'canoe_journey') then
    raise exception 'check 8: council section public before it was opened';
  end if;
  perform tribal_council_gate.record_council_decision('self:chinook', 'unlock_section', 'canoe_journey', null, '{}', v_approver, null, 'check');
  perform tribal_council_gate.record_council_decision('self:chinook', 'grant_public_display', 'canoe_journey', null, '{}', v_approver, null, 'check');
  if not exists (select 1 from public.tribal_council_gate_public_field_v1 where section_key = 'canoe_journey') then
    raise exception 'check 8: opened council section not public';
  end if;
  if (select section_order[array_length(section_order, 1)] from tribal_council_gate.layout where nation_key = 'self:chinook') <> 'canoe_journey' then
    raise exception 'check 8: added section missing from layout';
  end if;
  insert into gate_check_result values ('council_adds_sections', true);

  -- 9. Revoking everything hides everything at once.
  perform tribal_council_gate.record_council_decision('self:chinook', 'revoke_all', null, null, '{}', v_approver, null, 'check');
  select count(*) into v_count from public.tribal_council_gate_public_field_v1 where nation_key = 'self:chinook';
  if v_count <> 0 then raise exception 'check 9: % rows public after revoke_all', v_count; end if;
  insert into gate_check_result values ('revoke_all_hides_everything', true);

  -- 10. After withdrawal only resume is accepted.
  perform tribal_council_gate.record_council_decision('self:chinook', 'withdraw_participation', null, null, '{}', v_approver, null, 'check');
  v_failed := false;
  begin
    perform tribal_council_gate.record_council_decision('self:chinook', 'unlock_section', v_section, null, '{}', v_approver, null, 'check');
  exception when raise_exception then v_failed := true;
  end;
  if not v_failed then raise exception 'check 10: decision accepted after withdrawal'; end if;
  insert into gate_check_result values ('withdrawal_holds', true);

  -- 11. Luminari analysis is refused outside the route to recognition.
  v_failed := false;
  begin
    insert into tribal_council_gate.field (nation_key, section_key, field_key, value_text, source_posture, citation_url)
    values ('self:duwamish', 'identity_core', 'analysis_attempt', 'x', 'lighthouse_analysis_pending_tribal_review', 'https://example.org');
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'check 11: analysis accepted outside route_to_recognition'; end if;
  insert into tribal_council_gate.field (nation_key, section_key, field_key, value_text, source_posture, citation_url)
  values ('self:duwamish', 'route_to_recognition', 'analysis_ok', 'x', 'lighthouse_analysis_pending_tribal_review', 'https://example.org');
  insert into gate_check_result values ('analysis_only_in_route', true);

  -- 12. Words from a source must carry their citation.
  v_failed := false;
  begin
    insert into tribal_council_gate.field (nation_key, section_key, field_key, value_text, source_posture)
    values ('self:duwamish', 'identity_core', 'uncited', 'x', 'verbatim_tribal_source');
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'check 12: uncited source field accepted'; end if;
  insert into gate_check_result values ('citation_required', true);

  -- 13. The decision record cannot be rewritten.
  v_failed := false;
  begin
    update tribal_council_gate.council_decision set decision_basis = 'changed';
  exception when raise_exception then v_failed := true;
  end;
  if not v_failed then raise exception 'check 13: decision record was rewritten'; end if;
  insert into gate_check_result values ('decisions_append_only', true);

  -- 14. A letter cannot be marked sent before it is approved.
  insert into tribal_council_gate.council_contact (nation_key, addressee, mailing_address, source_posture, source_url)
  values ('self:duwamish', 'Duwamish Tribal Council', '4705 W Marginal Way SW, Seattle, WA 98106', 'own_website', 'https://www.duwamishtribe.org')
  returning contact_id into v_contact;
  insert into tribal_council_gate.outreach_letter (nation_key, contact_id, letter_kind, body_text, body_sha256, drafted_by)
  values ('self:duwamish', v_contact, 'initial_invitation', 'body', 'sha', 'check') returning letter_id into v_letter;
  v_failed := false;
  begin
    update tribal_council_gate.outreach_letter set letter_status = 'sent', sent_at = now() where letter_id = v_letter;
  exception when check_violation then v_failed := true;
  end;
  if not v_failed then raise exception 'check 14: letter sent without approval'; end if;
  insert into gate_check_result values ('letters_need_approval', true);
end;
$$;

-- 15. The browser roles can read nothing.
do $$
begin
  if has_table_privilege('anon', 'tribal_council_gate.field', 'select')
     or has_table_privilege('authenticated', 'tribal_council_gate.field', 'select')
     or has_table_privilege('anon', 'public.tribal_council_gate_public_field_v1', 'select') then
    raise exception 'check 15: browser role can read the gate directly';
  end if;
end;
$$;
insert into gate_check_result values ('browser_roles_closed', true);

select check_name, passed from gate_check_result;
rollback;
