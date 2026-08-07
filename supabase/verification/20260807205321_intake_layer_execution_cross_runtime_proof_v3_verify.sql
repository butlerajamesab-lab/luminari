-- Verification for generic intake layer execution receipts and cross-runtime proof.

begin;

do $contract$
declare
  v_definition text;
  v_acl_v2 boolean;
  v_acl_v3 boolean;
begin
  if to_regprocedure(
    'public.register_intake_layer_execution_v3(uuid,text,text,text,text,text,jsonb,text,jsonb,text,jsonb,jsonb)'
  ) is null then
    raise exception 'register_intake_layer_execution_v3 is missing';
  end if;

  select pg_get_constraintdef(oid)
    into v_definition
    from pg_constraint
   where conrelid = 'public.intake_layer_runs'::regclass
     and conname = 'intake_layer_runs_v2_receipt_digest_ck';

  if v_definition is null or position('layer_execution' in v_definition) = 0 then
    raise exception 'generic layer_execution receipt constraint is missing';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    select has_function_privilege(
      'service_role',
      'public.register_intake_layer_execution_v2(uuid,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)',
      'EXECUTE'
    ) into v_acl_v2;
    select has_function_privilege(
      'service_role',
      'public.register_intake_layer_execution_v3(uuid,text,text,text,text,text,jsonb,text,jsonb,text,jsonb,jsonb)',
      'EXECUTE'
    ) into v_acl_v3;

    if v_acl_v2 then
      raise exception 'service_role must not bypass the cross-runtime v3 verifier through v2';
    end if;
    if not v_acl_v3 then
      raise exception 'service_role must execute the v3 verifier';
    end if;
  end if;
end
$contract$;

do $smoke$
declare
  v_session uuid;
  v_first record;
  v_replay record;
  v_bad_input_caught boolean := false;
begin
  insert into public.intake_sessions(entry_channel, source_label, metadata)
  values ('manual', 'layer-execution-v3-cross-runtime-verify', '{"test_only":true}'::jsonb)
  returning intake_session_id into v_session;

  -- These two hashes were independently produced by the JavaScript
  -- canonicalStringify/sha256 implementation. PostgreSQL must reproduce them.
  select * into v_first
  from public.register_intake_layer_execution_v3(
    v_session,
    'stabilization_envelope',
    '2.0.0',
    '2.0.0',
    'N/A',
    repeat('a',64),
    '{"canonical_input":{"case_id":2,"labels":["a","b"],"note":"Cheryl & Rick","count":7},"layer_version":"2.0.0","rule_version":"2.0.0","rule_manifest_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","parser_version":"N/A","canonicalization_version":"luminari.intake.canonical-json.v2"}'::jsonb,
    '1ce9573a331d171724b3bf89de0145214a70c77279b445ac4e3032dc6a99faf1',
    '{"events":[{"date":"2025-01-15","state":"terminated"}],"count":1,"unresolved":false}'::jsonb,
    '311618b71f87260e114954a9e7f5eef0d172ed5e3c602cdbd91ccbd4474d8c1f',
    '[]'::jsonb,
    '[]'::jsonb
  );

  if v_first.reused_existing then
    raise exception 'first registration unexpectedly reused';
  end if;

  select * into v_replay
  from public.register_intake_layer_execution_v3(
    v_session,
    'stabilization_envelope',
    '2.0.0',
    '2.0.0',
    'N/A',
    repeat('a',64),
    '{"canonical_input":{"case_id":2,"labels":["a","b"],"note":"Cheryl & Rick","count":7},"layer_version":"2.0.0","rule_version":"2.0.0","rule_manifest_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","parser_version":"N/A","canonicalization_version":"luminari.intake.canonical-json.v2"}'::jsonb,
    '1ce9573a331d171724b3bf89de0145214a70c77279b445ac4e3032dc6a99faf1',
    '{"events":[{"date":"2025-01-15","state":"terminated"}],"count":1,"unresolved":false}'::jsonb,
    '311618b71f87260e114954a9e7f5eef0d172ed5e3c602cdbd91ccbd4474d8c1f',
    '[]'::jsonb,
    '[]'::jsonb
  );

  if not v_replay.reused_existing
     or v_replay.registered_layer_run_id <> v_first.registered_layer_run_id
     or v_replay.registered_receipt_hash <> v_first.registered_receipt_hash then
    raise exception 'idempotent database replay failed';
  end if;

  -- Unrestricted JavaScript JSON number rendering is not byte-identical to
  -- PostgreSQL jsonb rendering. A JS hash produced from 1e-7 must fail closed
  -- against PostgreSQL's canonical 0.0000001 representation.
  begin
    perform * from public.register_intake_layer_execution_v3(
      v_session,
      'raw_intake_capture',
      '2.0.0',
      '2.0.0',
      'N/A',
      repeat('a',64),
      '{"canonical_input":{"x":0.0000001},"layer_version":"2.0.0","rule_version":"2.0.0","rule_manifest_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","parser_version":"N/A","canonicalization_version":"luminari.intake.canonical-json.v2"}'::jsonb,
      '1e03aed2220164ee94794f8141eaa11abfbfb204e72d2a984e8200b3f6fdbd79',
      '[]'::jsonb,
      '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e9f3e8e9b8a5e8e9b9f0f0f',
      '[]'::jsonb,
      '[]'::jsonb
    );
  exception when sqlstate '23514' then
    v_bad_input_caught := true;
  end;

  if not v_bad_input_caught then
    raise exception 'cross-runtime canonical mismatch was not rejected';
  end if;

  if not exists (
    select 1
      from public.intake_layer_runs
     where layer_run_id = v_first.registered_layer_run_id
       and input_refs @> '[{"contract":"luminari.intake.cross-runtime-canonical-proof.v1","verified_by":"postgresql"}]'::jsonb
       and receipt ->> 'receipt_type' = 'layer_execution'
  ) then
    raise exception 'cross-runtime proof marker is missing';
  end if;
end
$smoke$;

rollback;
