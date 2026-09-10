-- Isolated fresh-replay verification. All fixtures and assertions roll back.
-- No production identities or participant mappings are used.
begin;
set local statement_timeout = '30s';

do $verify$
declare
  v_user_id integer := -2147483000;
  v_legacy_case_id integer := -2147483000;
  v_case_uuid uuid;
  v_session_id uuid := gen_random_uuid();
  v_artifact_id uuid := gen_random_uuid();
  v_first_id uuid;
  v_successor_id uuid;
  v_first_hash text;
  v_successor_hash text;
  v_evidence jsonb := '{"source_refs":["fixture:immutable-source"]}'::jsonb;
  v_receipt jsonb := '{"reviewer":"isolated-test"}'::jsonb;
  v_invalid record;
  v_copy public.intake_message_participant_assertions%rowtype;
  v_privilege text;
  v_role text;
  v_rpc regprocedure := 'public.append_reviewed_intake_message_participant_assertion_v1(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,integer,jsonb,uuid)'::regprocedure;
begin
  if exists (select 1 from public.users where id = v_user_id)
     or exists (select 1 from public.cases where id = v_legacy_case_id) then
    raise exception 'isolated participant fixture IDs already exist';
  end if;
  insert into public.users (id, open_id) values (v_user_id, 'participant-assertion-isolated-test');
  insert into public.cases (id, user_id, name)
    values (v_legacy_case_id, v_user_id, 'Participant assertion isolated fixture');
  select case_uuid into strict v_case_uuid from public.case_identity_bridge
    where legacy_case_id = v_legacy_case_id;
  insert into public.intake_sessions (intake_session_id, owner_user_id, session_type, entry_channel)
    values (v_session_id, v_user_id, 'fixture', 'isolated-verification');
  insert into public.intake_artifacts (artifact_id, intake_session_id, artifact_key, artifact_type, evidence_tier, availability)
    values (v_artifact_id, v_session_id, 'fixture:participant', 'source_document', 'source', 'available');
  insert into public.case_intake_links (intake_session_id, case_uuid, link_type, is_primary)
    values (v_session_id, v_case_uuid, 'primary_projection', true);

  if not has_table_privilege('service_role', 'public.intake_message_participant_assertions', 'SELECT')
     or not has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'service role is missing its reviewed append/read capability';
  end if;
  foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('service_role', 'public.intake_message_participant_assertions', v_privilege) then
      raise exception 'service role has unintended direct table privilege: %', v_privilege;
    end if;
  end loop;
  foreach v_role in array array['anon','authenticated'] loop
    if has_function_privilege(v_role, v_rpc, 'EXECUTE') then
      raise exception '% can invoke reviewed participant append', v_role;
    end if;
    foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(v_role, 'public.intake_message_participant_assertions', v_privilege) then
        raise exception '% has unintended participant table privilege: %', v_role, v_privilege;
      end if;
    end loop;
  end loop;

  set local role service_role;
  select assertion_id, assertion_identity_sha256 into strict v_first_id, v_first_hash
    from public.append_reviewed_intake_message_participant_assertion_v1(
      v_session_id, v_case_uuid, v_artifact_id, 'fixture:participant', ' received ', ' Contact ',
      ' Fixture Author ', v_evidence, ' fixture:provenance ', 'verified', v_user_id, v_receipt);
  if v_first_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'reviewed append did not return a SHA-256 identity';
  end if;

  for v_invalid in select * from (values
    (v_evidence, null::jsonb, 'verified'::text, v_user_id),
    (v_evidence, 'null'::jsonb, 'verified', v_user_id),
    (v_evidence, '[]'::jsonb, 'verified', v_user_id),
    (v_evidence, v_receipt, null::text, v_user_id),
    (v_evidence, v_receipt, 'pending', v_user_id),
    (v_evidence, v_receipt, 'verified', null::integer),
    (null::jsonb, v_receipt, 'verified', v_user_id),
    ('null'::jsonb, v_receipt, 'verified', v_user_id),
    ('{}'::jsonb, v_receipt, 'verified', v_user_id),
    ('[]'::jsonb, v_receipt, 'verified', v_user_id),
    ('{"source_refs":null}'::jsonb, v_receipt, 'verified', v_user_id),
    ('{"source_refs":{}}'::jsonb, v_receipt, 'verified', v_user_id),
    ('{"source_refs":[]}'::jsonb, v_receipt, 'verified', v_user_id)
  ) as invalid(evidence, receipt, status, reviewer) loop
    begin
      perform public.append_reviewed_intake_message_participant_assertion_v1(
        v_session_id, v_case_uuid, v_artifact_id, 'fixture:participant', 'received', 'Contact',
        'Fixture Author', v_invalid.evidence, 'fixture:invalid', v_invalid.status, v_invalid.reviewer, v_invalid.receipt);
      raise exception 'invalid receipt/evidence was accepted: %', row_to_json(v_invalid);
    exception when sqlstate '22023' then null;
    end;
  end loop;

  begin
    perform public.append_reviewed_intake_message_participant_assertion_v1(
      v_session_id, v_case_uuid, v_artifact_id, 'fixture:wrong-artifact', 'received', 'Contact',
      'Fixture Author', v_evidence, 'fixture:invalid-scope', 'verified', v_user_id, v_receipt);
    raise exception 'artifact scope mismatch was accepted';
  exception when check_violation then null;
  end;

  select assertion_id, assertion_identity_sha256 into strict v_successor_id, v_successor_hash
    from public.append_reviewed_intake_message_participant_assertion_v1(
      v_session_id, v_case_uuid, v_artifact_id, 'fixture:participant', 'received', 'Contact',
      'Reviewed Author', v_evidence, 'fixture:reviewed-provenance', 'verified', v_user_id, v_receipt, v_first_id);
  if v_successor_id = v_first_id or v_successor_hash = v_first_hash then
    raise exception 'supersession did not produce a new identity';
  end if;
  begin
    perform public.append_reviewed_intake_message_participant_assertion_v1(
      v_session_id, v_case_uuid, v_artifact_id, 'fixture:participant', 'received', 'Contact',
      'Duplicate Successor', v_evidence, 'fixture:duplicate-successor', 'verified', v_user_id, v_receipt, v_first_id);
    raise exception 'multiple successors were accepted';
  exception when unique_violation then null;
  end;
  reset role;

  select * into strict v_copy from public.intake_message_participant_assertions where assertion_id = v_first_id;
  if v_copy.source_contact_name <> 'Contact' or v_copy.author_canonical_name <> 'Fixture Author'
     or v_copy.message_direction <> 'received' or v_copy.provenance_ref <> 'fixture:provenance' then
    raise exception 'participant normalization failed';
  end if;
  if v_first_hash <> public.intake_message_participant_assertion_identity_v1(
    v_copy.intake_session_id, v_copy.case_uuid, v_copy.artifact_id, v_copy.artifact_key,
    v_copy.message_direction, v_copy.source_contact_name, v_copy.author_canonical_name,
    v_copy.evidence, v_copy.provenance_ref, v_copy.supersedes_assertion_id) then
    raise exception 'stored identity does not match canonical fields';
  end if;

  v_copy.assertion_id := gen_random_uuid();
  v_copy.assertion_identity_sha256 := repeat('0', 64);
  begin
    insert into public.intake_message_participant_assertions select (v_copy).*;
    raise exception 'mismatched caller-supplied hash was accepted';
  exception when check_violation then null;
  end;
  v_copy.provenance_ref := 'fixture:null-receipt';
  v_copy.review_receipt := null;
  v_copy.assertion_identity_sha256 := public.intake_message_participant_assertion_identity_v1(
    v_copy.intake_session_id, v_copy.case_uuid, v_copy.artifact_id, v_copy.artifact_key,
    v_copy.message_direction, v_copy.source_contact_name, v_copy.author_canonical_name,
    v_copy.evidence, v_copy.provenance_ref, v_copy.supersedes_assertion_id);
  begin
    insert into public.intake_message_participant_assertions select (v_copy).*;
    raise exception 'table constraint accepted a verified assertion with SQL NULL receipt';
  exception when check_violation then null;
  end;
  begin
    update public.intake_message_participant_assertions set author_canonical_name = 'Modified'
      where assertion_id = v_first_id;
    raise exception 'append-only update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.intake_message_participant_assertions where assertion_id = v_first_id;
    raise exception 'append-only delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select count(*) from public.intake_message_participant_assertions where intake_session_id = v_session_id) <> 2 then
    raise exception 'invalid requests changed participant assertion cardinality';
  end if;
  raise notice 'participant assertion runtime, NULL rejection, canonical identity, supersession, append-only and ACL checks passed';
end
$verify$;

rollback;
