-- Harden the Universal Intake Spine receipt chain.
--
-- Existing sealed fixture runs predate the executable canonical receipt
-- contract. They are preserved and explicitly labelled as legacy: their
-- receipt_hash is the SHA-256 of the PostgreSQL jsonb text that existed before
-- this migration, not a claim that they used the application canonicalizer.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.intake_layer_runs
  add column if not exists receipt_hash text,
  add column if not exists previous_receipt_hash text,
  add column if not exists hash_algorithm text,
  add column if not exists canonicalization_version text;

comment on column public.intake_layer_runs.receipt_hash is
  'Lowercase SHA-256 receipt hash under canonicalization_version.';
comment on column public.intake_layer_runs.previous_receipt_hash is
  'Hash of the preceding sealed receipt in the same semantic chain; null for a chain root or an explicitly unchained legacy receipt.';
comment on column public.intake_layer_runs.hash_algorithm is
  'Receipt hash algorithm. The current executable contract uses sha256.';
comment on column public.intake_layer_runs.canonicalization_version is
  'Canonical serialization contract used to derive receipt_hash.';

-- If a current-contract receipt was written during a phased rollout, adopt
-- only missing relational mirrors. Existing non-null values are intentionally
-- not overwritten: a mismatch must fail validation instead of being hidden.
update public.intake_layer_runs
set
  receipt_hash = coalesce(receipt_hash, nullif(receipt ->> 'receipt_hash', '')),
  previous_receipt_hash = coalesce(
    previous_receipt_hash,
    nullif(receipt #>> '{hash_basis,previous_receipt_hash}', '')
  ),
  hash_algorithm = coalesce(hash_algorithm, nullif(receipt ->> 'hash_algorithm', '')),
  canonicalization_version = coalesce(
    canonicalization_version,
    nullif(receipt ->> 'canonicalization_version', '')
  )
where is_sealed
  and receipt ->> 'canonicalization_version' = 'luminari.intake.canonical-json.v1'
  and receipt ->> 'hash_algorithm' = 'sha256'
  and receipt ->> 'receipt_hash' ~ '^[0-9a-f]{64}$'
  and (
    receipt_hash is null
    or hash_algorithm is null
    or canonicalization_version is null
    or (
      receipt #>> '{hash_basis,previous_receipt_hash}' is not null
      and previous_receipt_hash is null
    )
  );

-- Preserve pre-chain receipts without presenting them as current canonical
-- receipts. The reserved metadata records exactly what was hashed. A legacy
-- row remains an unchained root because its original receipt did not bind a
-- previous receipt hash into its hash basis.
with legacy_payloads as (
  select
    layer_run_id,
    case
      when jsonb_typeof(receipt) = 'object'
        then receipt - '_luminari_receipt_chain_migration'
      else jsonb_build_object('legacy_receipt', receipt)
    end as hash_payload
  from public.intake_layer_runs
  where is_sealed
    and canonicalization_version is null
), legacy_hashes as (
  select
    layer_run_id,
    hash_payload,
    encode(
      extensions.digest(convert_to(hash_payload::text, 'UTF8'), 'sha256'),
      'hex'
    ) as legacy_receipt_hash
  from legacy_payloads
)
update public.intake_layer_runs as runs
set
  receipt = legacy.hash_payload || jsonb_build_object(
    '_luminari_receipt_chain_migration',
    jsonb_build_object(
      'status', 'legacy_unverified_pre_chain',
      'canonicalization_version', 'postgres_jsonb_text_legacy_v1',
      'hash_algorithm', 'sha256',
      'receipt_hash_basis', 'postgres_jsonb_text_before_receipt_chain_migration',
      'receipt_hash', legacy.legacy_receipt_hash,
      'previous_receipt_hash', null
    )
  ),
  receipt_hash = legacy.legacy_receipt_hash,
  previous_receipt_hash = null,
  hash_algorithm = 'sha256',
  canonicalization_version = 'postgres_jsonb_text_legacy_v1'
from legacy_hashes as legacy
where runs.layer_run_id = legacy.layer_run_id;

-- Add constraints as NOT VALID so the backfill can be reviewed independently,
-- then validate each one against all existing rows in this transaction.
do $ddl$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.intake_sessions'::regclass
      and conname = 'intake_sessions_source_fingerprint_sha256_ck'
  ) then
    alter table public.intake_sessions
      add constraint intake_sessions_source_fingerprint_sha256_ck
      check (
        source_fingerprint is null
        or source_fingerprint ~ '^[0-9a-f]{64}$'
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stabilization_snapshots'::regclass
      and conname = 'stabilization_snapshots_hashes_sha256_ck'
  ) then
    alter table public.stabilization_snapshots
      add constraint stabilization_snapshots_hashes_sha256_ck
      check (
        input_hash ~ '^[0-9a-f]{64}$'
        and output_hash ~ '^[0-9a-f]{64}$'
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.intake_layer_runs'::regclass
      and conname = 'intake_layer_runs_hashes_sha256_ck'
  ) then
    alter table public.intake_layer_runs
      add constraint intake_layer_runs_hashes_sha256_ck
      check (
        input_hash ~ '^[0-9a-f]{64}$'
        and (output_hash is null or output_hash ~ '^[0-9a-f]{64}$')
        and (receipt_hash is null or receipt_hash ~ '^[0-9a-f]{64}$')
        and (
          previous_receipt_hash is null
          or previous_receipt_hash ~ '^[0-9a-f]{64}$'
        )
        and (
          receipt_hash is null
          or previous_receipt_hash is null
          or previous_receipt_hash <> receipt_hash
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.intake_layer_runs'::regclass
      and conname = 'intake_layer_runs_sealed_receipt_ck'
  ) then
    alter table public.intake_layer_runs
      add constraint intake_layer_runs_sealed_receipt_ck
      check (
        not is_sealed
        or (
          run_status = 'completed'
          and completed_at is not null
          and output_hash is not null
          and jsonb_typeof(receipt) = 'object'
          and receipt <> '{}'::jsonb
          and receipt_hash is not null
          and hash_algorithm = 'sha256'
          and canonicalization_version in (
            'luminari.intake.canonical-json.v1',
            'postgres_jsonb_text_legacy_v1'
          )
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.intake_layer_runs'::regclass
      and conname = 'intake_layer_runs_current_receipt_mirror_ck'
  ) then
    alter table public.intake_layer_runs
      add constraint intake_layer_runs_current_receipt_mirror_ck
      check (
        not is_sealed
        or canonicalization_version <> 'luminari.intake.canonical-json.v1'
        or coalesce(
          jsonb_typeof(receipt -> 'hash_basis') = 'object'
          and receipt ->> 'receipt_hash' is not distinct from receipt_hash
          and receipt ->> 'canonicalization_version'
            is not distinct from canonicalization_version
          and receipt ->> 'hash_algorithm' is not distinct from hash_algorithm
          and receipt #>> '{hash_basis,canonicalization_version}'
            is not distinct from canonicalization_version
          and receipt #>> '{hash_basis,hash_algorithm}'
            is not distinct from hash_algorithm
          and receipt #>> '{hash_basis,layer_name}'
            is not distinct from layer_name
          and receipt #>> '{hash_basis,layer_version}'
            is not distinct from layer_version
          and receipt #>> '{hash_basis,rule_version}'
            is not distinct from rule_version
          and receipt #>> '{hash_basis,input_hash}'
            is not distinct from input_hash
          and receipt #>> '{hash_basis,output_hash}'
            is not distinct from output_hash
          and (receipt -> 'hash_basis') ? 'previous_receipt_hash'
          and receipt #>> '{hash_basis,previous_receipt_hash}'
            is not distinct from previous_receipt_hash,
          false
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.intake_layer_runs'::regclass
      and conname = 'intake_layer_runs_legacy_receipt_label_ck'
  ) then
    alter table public.intake_layer_runs
      add constraint intake_layer_runs_legacy_receipt_label_ck
      check (
        not is_sealed
        or canonicalization_version <> 'postgres_jsonb_text_legacy_v1'
        or coalesce(
          previous_receipt_hash is null
          and jsonb_typeof(receipt -> '_luminari_receipt_chain_migration') = 'object'
          and receipt #>> '{_luminari_receipt_chain_migration,status}'
            = 'legacy_unverified_pre_chain'
          and receipt #>> '{_luminari_receipt_chain_migration,canonicalization_version}'
            is not distinct from canonicalization_version
          and receipt #>> '{_luminari_receipt_chain_migration,hash_algorithm}'
            is not distinct from hash_algorithm
          and receipt #>> '{_luminari_receipt_chain_migration,receipt_hash_basis}'
            = 'postgres_jsonb_text_before_receipt_chain_migration'
          and receipt #>> '{_luminari_receipt_chain_migration,receipt_hash}'
            is not distinct from receipt_hash
          and (receipt -> '_luminari_receipt_chain_migration')
            ? 'previous_receipt_hash'
          and receipt #> '{_luminari_receipt_chain_migration,previous_receipt_hash}'
            = 'null'::jsonb,
          false
        )
      ) not valid;
  end if;
end
$ddl$;

alter table public.intake_sessions
  validate constraint intake_sessions_source_fingerprint_sha256_ck;
alter table public.stabilization_snapshots
  validate constraint stabilization_snapshots_hashes_sha256_ck;
alter table public.intake_layer_runs
  validate constraint intake_layer_runs_hashes_sha256_ck;
alter table public.intake_layer_runs
  validate constraint intake_layer_runs_sealed_receipt_ck;
alter table public.intake_layer_runs
  validate constraint intake_layer_runs_current_receipt_mirror_ck;
alter table public.intake_layer_runs
  validate constraint intake_layer_runs_legacy_receipt_label_ck;

create index if not exists idx_intake_layer_runs_session_receipt_hash
  on public.intake_layer_runs (intake_session_id, receipt_hash)
  where is_sealed and receipt_hash is not null;

create or replace function public.luminari_reject_sealed_intake_layer_run_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.is_sealed then
    raise exception using
      errcode = '55000',
      message = format(
        'sealed intake layer run %s is immutable (%s rejected)',
        old.layer_run_id,
        tg_op
      );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

-- Guided Intake revisions and derived power registries are content-addressed
-- preserved artifacts. They can be superseded by inserting a child artifact,
-- but the preserved row itself cannot be rewritten or deleted.
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
       'power_dynamics_registry'
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

revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
  from public;
revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
  from public;

do $acl$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
      from anon;
    revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
      from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.luminari_reject_sealed_intake_layer_run_mutation()
      from authenticated;
    revoke all on function public.luminari_reject_preserved_intake_artifact_mutation()
      from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.luminari_reject_sealed_intake_layer_run_mutation()
      to service_role;
    grant execute on function public.luminari_reject_preserved_intake_artifact_mutation()
      to service_role;
  end if;
end
$acl$;

drop trigger if exists trg_intake_layer_runs_reject_sealed_mutation
  on public.intake_layer_runs;

create trigger trg_intake_layer_runs_reject_sealed_mutation
before update or delete on public.intake_layer_runs
for each row
execute function public.luminari_reject_sealed_intake_layer_run_mutation();

drop trigger if exists trg_intake_artifacts_reject_preserved_mutation
  on public.intake_artifacts;

create trigger trg_intake_artifacts_reject_preserved_mutation
before update or delete on public.intake_artifacts
for each row
execute function public.luminari_reject_preserved_intake_artifact_mutation();

comment on function public.luminari_reject_sealed_intake_layer_run_mutation() is
  'Rejects every UPDATE or DELETE of an already sealed Universal Intake Spine layer run.';
comment on function public.luminari_reject_preserved_intake_artifact_mutation() is
  'Rejects UPDATE or DELETE of preserved Guided Intake revision and power-dynamics artifacts; supersession requires insertion.';

commit;

