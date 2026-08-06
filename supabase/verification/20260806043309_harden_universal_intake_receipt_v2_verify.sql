-- Universal Intake Spine receipt v2 verification.
-- Read-only. Safe to run repeatedly after the matching migration.

begin;
set local transaction_read_only = on;

do $verify$
declare
  canonical_vector text;
  function_signature text;
begin
  if pg_catalog.to_regprocedure(
       'public.luminari_canonical_json_v2(jsonb)'
     ) is null then
    raise exception 'canonical JSON v2 function is missing';
  end if;

  canonical_vector := public.luminari_canonical_json_v2(
    '{"z":1,"arr":[3,true,null],"a":{"b":2,"a":"x"}}'::jsonb
  );
  if canonical_vector <> '{"a":{"a":"x","b":2},"arr":[3,true,null],"z":1}' then
    raise exception 'canonical JSON v2 vector mismatch: %', canonical_vector;
  end if;

  if exists (
    select 1
      from public.intake_layer_runs layer_run
     where layer_run.is_sealed
       and layer_run.canonicalization_version = 'luminari.intake.canonical-json.v2'
       and (
         layer_run.receipt ? 'hash_basis'
         or layer_run.receipt_hash is distinct from pg_catalog.encode(
           extensions.digest(
             pg_catalog.convert_to(
               public.luminari_canonical_json_v2(
                 layer_run.receipt - 'receipt_hash'
               ),
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
       )
  ) then
    raise exception 'v2 receipt hashes do not bind their full payload';
  end if;

  if exists (
    select 1
      from public.intake_layer_runs child
      left join public.intake_layer_runs parent
        on parent.intake_session_id = child.intake_session_id
       and parent.receipt_hash = child.previous_receipt_hash
     where child.is_sealed
       and child.previous_receipt_hash is not null
       and parent.layer_run_id is null
  ) then
    raise exception 'receipt predecessors are dangling';
  end if;

  if exists (
    select 1
      from public.intake_layer_runs layer_run
     where layer_run.is_sealed
       and layer_run.previous_receipt_hash is not null
     group by layer_run.intake_session_id, layer_run.previous_receipt_hash
    having count(*) > 1
  ) then
    raise exception 'receipt forks exist';
  end if;

  if exists (
    select 1
      from public.intake_layer_runs layer_run
     where layer_run.is_sealed
       and layer_run.previous_receipt_hash is null
       and layer_run.canonicalization_version in (
         'luminari.intake.canonical-json.v1',
         'luminari.intake.canonical-json.v2'
       )
     group by layer_run.intake_session_id
    having count(*) > 1
  ) then
    raise exception 'multiple application receipt roots exist';
  end if;

  if exists (
    select 1
      from public.case_intake_links case_link
     where case_link.is_primary
     group by case_link.case_uuid
    having count(*) > 1
  ) then
    raise exception 'multiple primary intake sessions exist for one case';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conrelid = 'public.intake_layer_runs'::regclass
       and constraint_record.conname = 'intake_layer_runs_v2_receipt_digest_ck'
       and constraint_record.convalidated
  ) then
    raise exception 'v2 receipt digest constraint is missing or unvalidated';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conrelid = 'public.intake_layer_runs'::regclass
       and constraint_record.conname = 'fk_intake_layer_runs_previous_receipt_same_session'
       and constraint_record.convalidated
  ) then
    raise exception 'same-session predecessor constraint is missing or unvalidated';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conrelid =
       'public.intake_verification_records'::regclass
       and constraint_record.conname =
         'intake_verification_records_no_new_inference_ck'
  ) then
    raise exception 'no-new-inference constraint is missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger trigger_record
     where trigger_record.tgrelid = 'public.intake_layer_runs'::regclass
       and trigger_record.tgname = 'trg_intake_layer_runs_enforce_chain_tip'
       and not trigger_record.tgisinternal
       and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'receipt chain-tip trigger is missing or disabled';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger trigger_record
     where trigger_record.tgrelid =
       'public.intake_verification_records'::regclass
       and trigger_record.tgname =
         'trg_intake_verification_records_append_only'
       and not trigger_record.tgisinternal
       and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'verification ledger append-only trigger is missing or disabled';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger trigger_record
     where trigger_record.tgrelid = 'public.intake_state_transitions'::regclass
       and trigger_record.tgname = 'trg_intake_state_transitions_append_only'
       and not trigger_record.tgisinternal
       and trigger_record.tgenabled <> 'D'
  ) then
    raise exception 'state-transition ledger append-only trigger is missing or disabled';
  end if;

  foreach function_signature in array array[
    'public.luminari_canonical_json_v2(jsonb)',
    'public.luminari_enforce_intake_receipt_chain_tip()',
    'public.luminari_reject_intake_ledger_mutation()',
    'public.luminari_reject_preserved_intake_artifact_mutation()'
  ]
  loop
    if pg_catalog.to_regprocedure(function_signature) is null then
      raise exception 'required receipt function is missing: %', function_signature;
    end if;

    if pg_catalog.has_function_privilege(
         'public', function_signature, 'execute'
       ) then
      raise exception 'PUBLIC can execute protected receipt function: %',
        function_signature;
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and pg_catalog.has_function_privilege(
         'anon', function_signature, 'execute'
       ) then
      raise exception 'anon can execute protected receipt function: %',
        function_signature;
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and pg_catalog.has_function_privilege(
         'authenticated', function_signature, 'execute'
       ) then
      raise exception 'authenticated can execute protected receipt function: %',
        function_signature;
    end if;

    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and not pg_catalog.has_function_privilege(
         'service_role', function_signature, 'execute'
       ) then
      raise exception 'service_role cannot execute receipt function: %',
        function_signature;
    end if;
  end loop;
end
$verify$;

select
  canonicalization_version,
  count(*)::bigint as sealed_receipt_count
from public.intake_layer_runs
where is_sealed
group by canonicalization_version
order by canonicalization_version;

rollback;
