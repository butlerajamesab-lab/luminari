-- ============================================================================
-- Migration 01 — Durable replay attempts (Phase 0 durability)
-- Schema: rosetta_replay (engine-independent; valid for control, lanes, and
-- any future engine). No section chunking of any kind is introduced here.
--
-- Operations are separate and callable:
--   register_source      : register an immutable source (tx A)
--   claim_attempt        : durably create-or-claim an attempt (tx B, later)
--   finalize_attempt     : durably record terminal state (tx C, later still)
--
-- Attempt identity = source hash + engine version + rule-set version
--                  + config hash + closure hash.
--
-- Timeout suppression: a retry is suppressed ONLY for an identical
-- (input hash, engine, deterministic failure class) triple — never a
-- blacklist against future engines or changed inputs.
-- Connection failures, deadlocks, and lock contention remain retryable.
-- ============================================================================

create schema if not exists rosetta_replay;

-- ---------------------------------------------------------------------------
-- 01.1 immutable source registry
-- ---------------------------------------------------------------------------
create table if not exists rosetta_replay.replay_source_registry (
    source_registry_id   uuid        primary key default gen_random_uuid(),
    source_content_id    uuid        not null,
    source_content_hash  text        not null,           -- sha256 of decoded parser text
    source_byte_length   bigint      not null check (source_byte_length >= 0),
    charset_receipt      jsonb       not null,           -- C7: decoding method,
                                                         -- invalid-byte handling,
                                                         -- replacement-char count
    registered_at        timestamptz not null default now(),
    registered_by        text        not null default current_user,
    unique (source_content_id, source_content_hash)
);
comment on table rosetta_replay.replay_source_registry is
  'Immutable registration of a replay source. One row per (content id, hash). No updates, no deletes.';
comment on column rosetta_replay.replay_source_registry.charset_receipt is
  'C7 receipt: {decoding_method, source_charset, invalid_byte_handling, invalid_byte_count, replacement_char_count, replacement_chars_block_span_certainty, disposition}.';

create or replace function rosetta_replay.reject_registry_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'rosetta_replay_source_registry_is_immutable'
    using errcode = 'raise_exception';
end;
$fn$;

drop trigger if exists replay_source_registry_immutable
  on rosetta_replay.replay_source_registry;
create trigger replay_source_registry_immutable
  before update or delete on rosetta_replay.replay_source_registry
  for each row execute function rosetta_replay.reject_registry_mutation();

-- ---------------------------------------------------------------------------
-- 01.2 durable attempts
-- ---------------------------------------------------------------------------
create table if not exists rosetta_replay.replay_attempt (
    attempt_id           uuid        primary key default gen_random_uuid(),
    source_registry_id   uuid        not null
        references rosetta_replay.replay_source_registry(source_registry_id),
    engine_version       text        not null,
    rule_set_version     text        not null,
    config_hash          text        not null,
    closure_hash         text        not null,
    attempt_identity     text        generated always as
        (source_registry_id::text || '|' || engine_version || '|'
         || rule_set_version || '|' || config_hash || '|' || closure_hash) stored,
    retry_seq            integer     not null default 0,
    attempt_state        text        not null default 'claimed'
        check (attempt_state in ('claimed','running','succeeded','rejected',
                                 'deferred_oversized','timed_out',
                                 'failed_retryable','failed_terminal')),
    is_terminal          boolean     generated always as
        (attempt_state in ('succeeded','rejected','deferred_oversized',
                           'timed_out','failed_terminal')) stored,
    worker_identity      text,
    lease_expires_at     timestamptz,      -- a running attempt is owned until this
    claimed_at           timestamptz not null default clock_timestamp(),
    started_at           timestamptz,
    finished_at          timestamptz,
    -- staged outcome written by replay_execute (its own transaction);
    -- replay_finalize (a later transaction) turns it into a terminal receipt.
    pending_outcome      text,
    pending_sqlstate     text,
    pending_error_detail text,
    pending_payload      jsonb,
    unique (attempt_identity, retry_seq)   -- retryable history never suppresses:
);                                         -- a new attempt gets retry_seq+1
comment on table rosetta_replay.replay_attempt is
  'Durable create-or-claim of a replay attempt. Identity = source hash + engine + rule-set + config hash + closure hash. History is append-only via replay_receipt; the attempt row only ever moves forward in its state machine. One worker owns a running attempt until lease_expires_at; adoption after expiry is the crash-recovery path.';

-- ---------------------------------------------------------------------------
-- 01.3 append-only receipts (one per state transition / failure observation)
-- ---------------------------------------------------------------------------
create table if not exists rosetta_replay.replay_receipt (
    receipt_id           uuid        primary key default gen_random_uuid(),
    receipt_seq          bigint      generated always as identity,  -- monotonic
    attempt_id           uuid        not null
        references rosetta_replay.replay_attempt(attempt_id),
    receipt_kind         text        not null
        check (receipt_kind in ('claim','start','success','rejection','deferred',
                                'timeout','retryable_failure','terminal_failure')),
    sqlstate             text,
    error_detail         text,       -- bounded: left(..., 4000) at write time
    failure_class        text        check (failure_class in
        ('deterministic_parse','deterministic_validation','timeout',
         'connection','deadlock','lock_contention','resource','unknown')),
    is_retryable         boolean,
    worker_identity      text,
    receipt_at           timestamptz not null default clock_timestamp(),
    receipt_payload      jsonb       not null default '{}'::jsonb
);
comment on table rosetta_replay.replay_receipt is
  'Append-only. Every transition and every failure observation leaves a receipt with SQLSTATE, bounded error detail, failure class, retryability, timestamp, worker identity. Ordering is by receipt_seq (monotonic identity), never by wall-clock ties.';

create or replace function rosetta_replay.reject_receipt_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'rosetta_replay_receipt_is_append_only'
    using errcode = 'raise_exception';
end;
$fn$;

drop trigger if exists replay_receipt_append_only on rosetta_replay.replay_receipt;
create trigger replay_receipt_append_only
  before update or delete on rosetta_replay.replay_receipt
  for each row execute function rosetta_replay.reject_receipt_mutation();

-- ---------------------------------------------------------------------------
-- 01.4 failure classification (pure; SQLSTATE-driven)
-- ---------------------------------------------------------------------------
create or replace function rosetta_replay.classify_failure(p_sqlstate text)
returns table (failure_class text, is_retryable boolean)
language plpgsql immutable as $fn$
begin
  if p_sqlstate is null then
    return query select 'unknown'::text, false;
  elsif p_sqlstate = '57014' then                       -- statement_timeout
    return query select 'timeout'::text, false;
  elsif p_sqlstate in ('40P01') then                    -- deadlock
    return query select 'deadlock'::text, true;
  elsif p_sqlstate in ('55P03','55P04') then            -- lock not available
    return query select 'lock_contention'::text, true;
  elsif p_sqlstate like '08%' then                      -- connection exception
    return query select 'connection'::text, true;
  elsif p_sqlstate in ('53000','53100','53200','53300','53400') then  -- resources
    return query select 'resource'::text, true;
  elsif p_sqlstate like '22%' or p_sqlstate like '23%'
     or p_sqlstate like 'P1%' or p_sqlstate = 'P0001'
     or p_sqlstate = 'raise_exception' then
    -- data/integrity/raised validation failures: deterministic for THIS input
    return query select 'deterministic_validation'::text, false;
  else
    return query select 'unknown'::text, false;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 01.5 register_source (transaction A)
-- ---------------------------------------------------------------------------
create or replace function rosetta_replay.register_source(
    p_source_content_id   uuid,
    p_source_content_hash text,
    p_source_byte_length  bigint,
    p_charset_receipt     jsonb)
returns uuid language plpgsql as $fn$
declare
  v_id uuid;
begin
  if p_source_content_hash is null or p_source_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'source_content_hash must be a lowercase sha256 hex digest'
      using errcode = '22023';
  end if;
  if p_charset_receipt is null
     or nullif(p_charset_receipt->>'source_charset','') is null
     or nullif(p_charset_receipt->>'decoding_method','') is null
     or not (p_charset_receipt ? 'invalid_byte_handling')
     or not (p_charset_receipt ? 'replacement_char_count')
     or not (p_charset_receipt ? 'replacement_chars_block_span_certainty')
     or (p_charset_receipt->>'replacement_char_count') !~ '^[0-9]+$' then
    raise exception 'charset_receipt must record source_charset, decoding_method, invalid_byte_handling, replacement_char_count, and replacement_chars_block_span_certainty'
      using errcode = '22023';
  end if;
  if (p_charset_receipt->>'replacement_char_count')::integer > 0
     and (p_charset_receipt->>'replacement_char_disposition') is distinct from 'manual_verified_literal' then
    raise exception 'replacement characters require manual_verified_literal disposition'
      using errcode = '22023';
  end if;
  insert into rosetta_replay.replay_source_registry
    (source_content_id, source_content_hash, source_byte_length, charset_receipt)
  values (p_source_content_id, p_source_content_hash,
          p_source_byte_length, p_charset_receipt)
  on conflict (source_content_id, source_content_hash) do nothing
  returning source_registry_id into v_id;
  if v_id is null then
    -- idempotent re-registration: read the existing immutable row
    select r.source_registry_id into v_id
    from rosetta_replay.replay_source_registry r
    where r.source_content_id = p_source_content_id
      and r.source_content_hash = p_source_content_hash;
  end if;
  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 01.6 claim_attempt (transaction B; durable create-or-claim)
--      One worker owns a claimed/running attempt until lease_expires_at.
--      Retryable failures and timeouts NEVER suppress: a new attempt row is
--      created with retry_seq+1. Suppression applies only to terminal
--      success/rejection and to deterministic terminal failure for the
--      identical identity (input+engine+ruleset+config+closure) — never a
--      blacklist against future engines or changed inputs.
-- ---------------------------------------------------------------------------
create or replace function rosetta_replay.claim_attempt(
    p_source_registry_id uuid,
    p_engine_version     text,
    p_rule_set_version   text,
    p_config_hash        text,
    p_closure_hash       text,
    p_worker_identity    text default null,
    p_lease              interval default interval '5 minutes')
returns uuid language plpgsql as $fn$
declare
  v_attempt uuid;
  v_state   text;
  v_worker  text;
  v_lease   timestamptz;
  v_retry   integer;
  v_new     uuid;
begin
  insert into rosetta_replay.replay_attempt
    (source_registry_id, engine_version, rule_set_version,
     config_hash, closure_hash, retry_seq, worker_identity, lease_expires_at)
  values (p_source_registry_id, p_engine_version, p_rule_set_version,
          p_config_hash, p_closure_hash, 0, p_worker_identity,
          clock_timestamp() + p_lease)
  on conflict (attempt_identity, retry_seq) do nothing
  returning attempt_id, attempt_state into v_attempt, v_state;

  if v_attempt is not null then
    insert into rosetta_replay.replay_receipt (attempt_id, receipt_kind, worker_identity)
    values (v_attempt, 'claim', p_worker_identity);
    return v_attempt;
  end if;

  -- identity already exists: inspect the latest attempt in its retry chain
  select a.attempt_id, a.attempt_state, a.worker_identity, a.lease_expires_at, a.retry_seq
    into v_attempt, v_state, v_worker, v_lease, v_retry
  from rosetta_replay.replay_attempt a
  where a.attempt_identity =
        p_source_registry_id::text || '|' || p_engine_version || '|'
        || p_rule_set_version || '|' || p_config_hash || '|' || p_closure_hash
  order by a.retry_seq desc
  limit 1
  for update;

  if v_state in ('claimed','running') then
    -- owned: only the same worker, or any worker after lease expiry, may adopt
    if v_worker is not null and p_worker_identity is not null
       and v_worker <> p_worker_identity
       and (v_lease is null or v_lease > clock_timestamp()) then
      raise exception 'attempt % is leased to worker % until %',
        v_attempt, v_worker, v_lease
        using errcode = '55P03';   -- lock_contention: retryable, never swallowed
    end if;
    update rosetta_replay.replay_attempt
       set worker_identity = coalesce(p_worker_identity, worker_identity),
           lease_expires_at = clock_timestamp() + p_lease
     where attempt_id = v_attempt;
    insert into rosetta_replay.replay_receipt
      (attempt_id, receipt_kind, worker_identity, receipt_payload)
    values (v_attempt, 'claim', p_worker_identity,
            jsonb_build_object('adopted', true));
    return v_attempt;
  end if;

  if v_state in ('failed_retryable','timed_out') then
    -- retryable history never suppresses; timeouts are environmental, not a
    -- deterministic defect. A new attempt continues the chain.
    insert into rosetta_replay.replay_attempt
      (source_registry_id, engine_version, rule_set_version,
       config_hash, closure_hash, retry_seq, worker_identity, lease_expires_at)
    values (p_source_registry_id, p_engine_version, p_rule_set_version,
            p_config_hash, p_closure_hash, v_retry + 1, p_worker_identity,
            clock_timestamp() + p_lease)
    returning attempt_id into v_new;
    insert into rosetta_replay.replay_receipt
      (attempt_id, receipt_kind, worker_identity, receipt_payload)
    values (v_new, 'claim', p_worker_identity,
            jsonb_build_object('retry_of', v_attempt, 'prior_state', v_state));
    return v_new;
  end if;

  -- succeeded / rejected / deferred / failed_terminal: durable history;
  -- the identical identity is suppressed and the same attempt is returned.
  return v_attempt;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 01.7 finalize_attempt (transaction C)
-- ---------------------------------------------------------------------------
create or replace function rosetta_replay.finalize_attempt(
    p_attempt_id      uuid,
    p_outcome         text,          -- success|rejection|deferred|timeout|retryable_failure|terminal_failure
    p_sqlstate        text default null,
    p_error_detail    text default null,
    p_worker_identity text default null,
    p_payload         jsonb default '{}'::jsonb)
returns uuid language plpgsql as $fn$
declare
  v_class     text;
  v_retryable boolean;
  v_state     text;
  v_receipt   uuid;
begin
  if p_outcome not in ('success','rejection','deferred','timeout','retryable_failure','terminal_failure') then
    raise exception 'unknown finalize outcome: %', p_outcome using errcode = '22023';
  end if;

  select a.attempt_state into v_state
  from rosetta_replay.replay_attempt a where a.attempt_id = p_attempt_id
  for update;
  if not found then
    raise exception 'attempt % not found', p_attempt_id using errcode = 'P0002';
  end if;
  if v_state in ('succeeded','rejected','deferred_oversized','timed_out','failed_terminal') then
    raise exception 'attempt % is already terminal (%)', p_attempt_id, v_state
      using errcode = 'raise_exception';
  end if;

  if p_outcome in ('timeout','retryable_failure','terminal_failure') then
    select c.failure_class, c.is_retryable into v_class, v_retryable
    from rosetta_replay.classify_failure(p_sqlstate) c;
    -- caller-declared outcome refines the class for deterministic failures
    if p_outcome = 'terminal_failure' then v_retryable := false; end if;
    if p_outcome = 'retryable_failure' then
      if v_class is null or not v_retryable then
        -- trust SQLSTATE over caller optimism: non-retryable classes stay final
        v_retryable := coalesce(v_retryable, false);
      end if;
    end if;
  else
    v_class := null; v_retryable := null;
  end if;

  v_state := case p_outcome
    when 'success'           then 'succeeded'
    when 'rejection'         then 'rejected'
    when 'deferred'          then 'deferred_oversized'
    when 'timeout'           then 'timed_out'
    when 'retryable_failure' then 'failed_retryable'
    when 'terminal_failure'  then 'failed_terminal' end;

  update rosetta_replay.replay_attempt
     set attempt_state = v_state, finished_at = clock_timestamp(),
         pending_outcome = null, pending_sqlstate = null,
         pending_error_detail = null, pending_payload = null,
         worker_identity = coalesce(p_worker_identity, worker_identity)
   where attempt_id = p_attempt_id;

  insert into rosetta_replay.replay_receipt
    (attempt_id, receipt_kind, sqlstate, error_detail,
     failure_class, is_retryable, worker_identity, receipt_payload)
  values (p_attempt_id, p_outcome::text, p_sqlstate,
          left(coalesce(p_error_detail,''), 4000),
          v_class, v_retryable, p_worker_identity, coalesce(p_payload,'{}'::jsonb))
  returning receipt_id into v_receipt;
  return v_receipt;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 01.8 suppression view: which (input, engine) pairs are suppressed and why.
--      Suppression applies ONLY where the terminal outcome is success,
--      rejection, or a deterministic terminal failure for the identical
--      identity. Retryable classes and timeouts are never suppressed
--      (claim_attempt gives them a new retry_seq attempt instead).
-- ---------------------------------------------------------------------------
create or replace view rosetta_replay.v_replay_suppressed_identities as
select a.source_registry_id, a.engine_version, a.rule_set_version,
       a.config_hash, a.closure_hash, a.attempt_state,
       r.failure_class, r.is_retryable
from rosetta_replay.replay_attempt a
join lateral (
  select rr.failure_class, rr.is_retryable
  from rosetta_replay.replay_receipt rr
  where rr.attempt_id = a.attempt_id
  order by rr.receipt_seq desc limit 1
) r on true
where a.attempt_state in ('succeeded','rejected','deferred_oversized','failed_terminal');

-- ---------------------------------------------------------------------------
-- 01.9 lockdown: no PUBLIC/anon/authenticated writes
-- ---------------------------------------------------------------------------
revoke all on schema rosetta_replay from public;
revoke all on all tables in schema rosetta_replay from public;
revoke all on all functions in schema rosetta_replay from public;
