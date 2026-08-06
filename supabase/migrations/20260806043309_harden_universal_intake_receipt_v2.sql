-- Universal Intake Spine receipt v2 acceptance and ledger hardening.
--
-- Rollout phase 1: this migration accepts and validates v2 while temporarily
-- retaining v1 compatibility for already-running application instances. A
-- later enforcement migration must reject new v1 receipts after the v2
-- runtime has deployed and old instances have drained.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $dependency$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception using
      errcode = '55000',
      message = 'Universal Intake Spine receipt v2 requires extensions.digest(bytea,text)';
  end if;
end
$dependency$;

create or replace function public.luminari_canonical_json_v2(value jsonb)
returns text
language plpgsql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
declare
  kind text := pg_catalog.jsonb_typeof(value);
  rendered text;
begin
  case kind
    when 'object' then
      select '{' || coalesce(
        pg_catalog.string_agg(
          pg_catalog.to_jsonb(entry.key)::text || ':' ||
            public.luminari_canonical_json_v2(entry.value),
          ',' order by entry.key collate pg_catalog."C"
        ),
        ''
      ) || '}'
      into rendered
      from pg_catalog.jsonb_each(value) as entry(key, value);
      return rendered;

    when 'array' then
      select '[' || coalesce(
        pg_catalog.string_agg(
          public.luminari_canonical_json_v2(entry.value),
          ',' order by entry.ordinality
        ),
        ''
      ) || ']'
      into rendered
      from pg_catalog.jsonb_array_elements(value)
        with ordinality as entry(value, ordinality);
      return rendered;

    when 'string', 'number', 'boolean', 'null' then
      return value::text;

    else
      raise exception 'unsupported canonical JSON type: %', kind;
  end case;
end
$function$;

revoke all on function public.luminari_canonical_json_v2(jsonb) from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.luminari_canonical_json_v2(jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.luminari_canonical_json_v2(jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.luminari_canonical_json_v2(jsonb)
      to service_role;
  end if;
end
$acl$;

alter table public.intake_layer_runs
  drop constraint if exists intake_layer_runs_sealed_receipt_ck;

alter table public.intake_layer_runs
  add constraint intake_layer_runs_sealed_receipt_ck
  check (
    not is_sealed
    or (
      run_status = 'completed'
      and completed_at is not null
      and output_hash is not null
      and pg_catalog.jsonb_typeof(receipt) = 'object'
      and receipt <> '{}'::jsonb
      and receipt_hash is not null
      and hash_algorithm = 'sha256'
      and canonicalization_version in (
        'luminari.intake.canonical-json.v1',
        'luminari.intake.canonical-json.v2',
        'postgres_jsonb_text_legacy_v1'
      )
    )
  ) not valid;

alter table public.intake_layer_runs
  validate constraint intake_layer_runs_sealed_receipt_ck;

do $constraints$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_layer_runs'::regclass
       and conname = 'intake_layer_runs_v2_receipt_digest_ck'
  ) then
    alter table public.intake_layer_runs
      add constraint intake_layer_runs_v2_receipt_digest_ck
      check (
        not is_sealed
        or canonicalization_version <> 'luminari.intake.canonical-json.v2'
        or coalesce(
          not (receipt ? 'hash_basis')
          and receipt ?& array[
            'artifact_id', 'artifact_key', 'byte_size',
            'canonicalization_version', 'case_uuid', 'filename',
            'hash_algorithm', 'input_hash', 'intake_session_id',
            'layer_name', 'layer_run_id', 'layer_version',
            'legacy_case_id', 'legacy_document_id', 'mime_type',
            'output_hash', 'previous_canonicalization_version',
            'previous_receipt_hash', 'preservation_mode',
            'preservation_state', 'receipt_hash', 'receipt_type',
            'receipt_version', 'replacement_reason',
            'replaces_legacy_document_id', 'rule_version', 'sha256',
            'snapshot_id', 'source_receipt_hash', 'storage_bucket',
            'storage_object_path', 'transition_id',
            'verification_record_id', 'verification_scope'
          ]
          and receipt ->> 'canonicalization_version'
            is not distinct from canonicalization_version
          and receipt ->> 'hash_algorithm' is not distinct from hash_algorithm
          and receipt ->> 'intake_session_id'
            is not distinct from intake_session_id::text
          and receipt ->> 'layer_run_id' is not distinct from layer_run_id::text
          and receipt ->> 'layer_name' is not distinct from layer_name
          and receipt ->> 'layer_version' is not distinct from layer_version
          and receipt ->> 'rule_version' is not distinct from rule_version
          and receipt ->> 'input_hash' is not distinct from input_hash
          and receipt ->> 'output_hash' is not distinct from output_hash
          and receipt ->> 'previous_receipt_hash'
            is not distinct from previous_receipt_hash
          and receipt ->> 'receipt_hash' is not distinct from receipt_hash
          and receipt ->> 'receipt_version' = '2.0.0'
          and receipt ->> 'preservation_state' = 'preserved'
          and receipt ->> 'legacy_case_id' ~ '^[1-9][0-9]*$'
          and receipt ->> 'legacy_document_id' ~ '^[1-9][0-9]*$'
          and receipt ->> 'snapshot_id' ~ '^[1-9][0-9]*$'
          and receipt ->> 'byte_size' ~ '^[0-9]+$'
          and receipt ->> 'sha256' ~ '^[0-9a-f]{64}$'
          and (
            (
              receipt ->> 'preservation_mode' = 'uploaded_bytes'
              and receipt ->> 'receipt_type' = 'evidence_preservation'
              and receipt ->> 'verification_scope'
                = 'request_bytes_and_storage_addressability'
              and receipt -> 'source_receipt_hash' = 'null'::jsonb
            )
            or (
              receipt ->> 'preservation_mode' = 'existing_receipted_document'
              and receipt ->> 'receipt_type' = 'document_replacement'
              and receipt ->> 'verification_scope'
                = 'prior_receipt_and_storage_addressability'
              and receipt ->> 'source_receipt_hash' ~ '^[0-9a-f]{64}$'
              and receipt ->> 'replaces_legacy_document_id' ~ '^[1-9][0-9]*$'
            )
          )
          and receipt_hash = pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(
                public.luminari_canonical_json_v2(receipt - 'receipt_hash'),
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          ),
          false
        )
      ) not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_layer_runs'::regclass
       and conname = 'uq_intake_layer_runs_session_receipt_hash'
  ) then
    alter table public.intake_layer_runs
      add constraint uq_intake_layer_runs_session_receipt_hash
      unique (intake_session_id, receipt_hash);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_layer_runs'::regclass
       and conname = 'fk_intake_layer_runs_previous_receipt_same_session'
  ) then
    alter table public.intake_layer_runs
      add constraint fk_intake_layer_runs_previous_receipt_same_session
      foreign key (intake_session_id, previous_receipt_hash)
      references public.intake_layer_runs (intake_session_id, receipt_hash)
      on update restrict
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.intake_verification_records'::regclass
       and conname = 'intake_verification_records_no_new_inference_ck'
  ) then
    alter table public.intake_verification_records
      add constraint intake_verification_records_no_new_inference_ck
      check (verification_state <> 'inference') not valid;
  end if;
end
$constraints$;

alter table public.intake_layer_runs
  validate constraint intake_layer_runs_v2_receipt_digest_ck;
alter table public.intake_layer_runs
  validate constraint fk_intake_layer_runs_previous_receipt_same_session;

do $validate_no_inference$
begin
  if not exists (
    select 1
      from public.intake_verification_records
     where verification_state = 'inference'
  ) then
    alter table public.intake_verification_records
      validate constraint intake_verification_records_no_new_inference_ck;
  end if;
end
$validate_no_inference$;

create unique index if not exists ux_intake_layer_runs_one_successor
  on public.intake_layer_runs (intake_session_id, previous_receipt_hash)
  where is_sealed and previous_receipt_hash is not null;

create unique index if not exists ux_intake_layer_runs_one_application_root
  on public.intake_layer_runs (intake_session_id)
  where is_sealed
    and previous_receipt_hash is null
    and canonicalization_version in (
      'luminari.intake.canonical-json.v1',
      'luminari.intake.canonical-json.v2'
    );

create unique index if not exists ux_case_intake_links_one_primary_case
  on public.case_intake_links (case_uuid)
  where is_primary;

create or replace function public.luminari_enforce_intake_receipt_chain_tip()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_tip_hash text;
  current_tip_version text;
  current_tip_sealed_at timestamptz;
begin
  if not new.is_sealed then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.is_sealed then
      return new;
    end if;
  end if;

  if new.canonicalization_version = 'postgres_jsonb_text_legacy_v1' then
    raise exception using
      errcode = '23514',
      message = 'new legacy intake receipts are forbidden';
  end if;

  perform 1
    from public.intake_sessions
   where intake_session_id = new.intake_session_id
   for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'intake receipt session does not exist';
  end if;

  select receipt_hash, canonicalization_version, sealed_at
    into current_tip_hash, current_tip_version, current_tip_sealed_at
    from public.intake_layer_runs
   where intake_session_id = new.intake_session_id
     and is_sealed
     and receipt_hash is not null
   order by sealed_at desc, layer_run_id desc
   limit 1;

  if new.previous_receipt_hash is distinct from current_tip_hash then
    raise exception using
      errcode = '23514',
      message = 'intake receipt must extend the current session tip';
  end if;

  if current_tip_sealed_at is not null and new.sealed_at < current_tip_sealed_at then
    raise exception using
      errcode = '23514',
      message = 'intake receipt sealed_at cannot precede its parent';
  end if;

  if new.canonicalization_version = 'luminari.intake.canonical-json.v2' then
    if not (new.receipt ? 'previous_canonicalization_version')
       or new.receipt ->> 'previous_canonicalization_version'
         is distinct from current_tip_version then
      raise exception using
        errcode = '23514',
        message = 'intake receipt predecessor version mirror mismatch';
    end if;
  elsif new.canonicalization_version = 'luminari.intake.canonical-json.v1'
        and exists (
          select 1
            from public.intake_layer_runs
           where intake_session_id = new.intake_session_id
             and is_sealed
             and canonicalization_version = 'luminari.intake.canonical-json.v2'
        ) then
    raise exception using
      errcode = '23514',
      message = 'intake receipt canonicalization downgrade rejected';
  end if;

  return new;
end
$function$;

create or replace function public.luminari_reject_intake_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = format(
      'Universal Intake Spine ledger %s is append-only (%s rejected)',
      tg_table_name,
      tg_op
    );
end
$function$;

-- Preserved source documents now follow the same insert-to-supersede rule as
-- the original Guided Intake and power-dynamics preserved artifacts.
create or replace function public.luminari_reject_preserved_intake_artifact_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.artifact_status = 'preserved'
     and old.artifact_type in (
       'guided_intake_revision',
       'power_dynamics_registry',
       'source_document'
     ) then
    raise exception using
      errcode = '55000',
      message = format(
        'preserved intake artifact %s (%s) is immutable (%s rejected)',
        old.artifact_id,
        old.artifact_type,
        tg_op
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

revoke all on function public.luminari_enforce_intake_receipt_chain_tip()
  from public;
revoke all on function public.luminari_reject_intake_ledger_mutation()
  from public;
revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
  from public;

do $function_acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.luminari_enforce_intake_receipt_chain_tip()
      from anon;
    revoke all on function public.luminari_reject_intake_ledger_mutation()
      from anon;
    revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
      from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.luminari_enforce_intake_receipt_chain_tip()
      from authenticated;
    revoke all on function public.luminari_reject_intake_ledger_mutation()
      from authenticated;
    revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
      from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.luminari_enforce_intake_receipt_chain_tip()
      to service_role;
    grant execute on function public.luminari_reject_intake_ledger_mutation()
      to service_role;
    grant execute on function public.luminari_reject_preserved_intake_artifact_mutation()
      to service_role;
  end if;
end
$function_acl$;

drop trigger if exists trg_intake_layer_runs_enforce_chain_tip
  on public.intake_layer_runs;
create trigger trg_intake_layer_runs_enforce_chain_tip
before insert or update on public.intake_layer_runs
for each row
when (new.is_sealed)
execute function public.luminari_enforce_intake_receipt_chain_tip();

drop trigger if exists trg_intake_verification_records_append_only
  on public.intake_verification_records;
create trigger trg_intake_verification_records_append_only
before update or delete on public.intake_verification_records
for each row
execute function public.luminari_reject_intake_ledger_mutation();

drop trigger if exists trg_intake_state_transitions_append_only
  on public.intake_state_transitions;
create trigger trg_intake_state_transitions_append_only
before update or delete on public.intake_state_transitions
for each row
execute function public.luminari_reject_intake_ledger_mutation();

comment on function public.luminari_canonical_json_v2(jsonb) is
  'Canonical JSON serializer for Universal Intake Spine v2 receipt hashing.';
comment on function public.luminari_enforce_intake_receipt_chain_tip() is
  'Serializes sealed receipt writers by session and requires every new receipt to extend the current tip.';
comment on function public.luminari_reject_intake_ledger_mutation() is
  'Makes Universal Intake Spine verification and transition ledgers append-only, including during attempted cascades.';
comment on function public.luminari_reject_preserved_intake_artifact_mutation() is
  'Rejects UPDATE or DELETE of preserved Guided Intake, power-dynamics, and source-document artifacts; supersession requires insertion.';

commit;
