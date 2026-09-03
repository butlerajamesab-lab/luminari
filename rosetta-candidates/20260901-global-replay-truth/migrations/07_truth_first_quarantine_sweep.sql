begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- This is an additive correction to the already-recorded 01-06 history.
-- A campaign is a frozen corpus observation, not a universal-pass assertion:
-- every member gets at most one execution attempt and every first terminal
-- non-success becomes an immutable quarantine disposition. The sweep continues.

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign') is null
     or to_regclass('rosetta_replay.replay_campaign_event') is null
     or to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.replay_attempt') is null
     or to_regclass('rosetta_replay.replay_run_binding') is null
     or to_regclass('rosetta_replay.corpus_snapshot_receipt') is null
     or to_regclass('rosetta_replay.candidate_generation_authorization') is null
     or to_regclass('rosetta_v2513.source_document_content') is null
     or to_regclass('rosetta_v2513.source_document') is null
     or to_regprocedure(
       'rosetta_replay.replay_campaign_source_eligible(uuid,text)') is null
     or to_regprocedure(
       'rosetta_replay.expected_configuration_hash(uuid)') is null
     or to_regprocedure(
       'rosetta_replay.replay_campaign_unschedule_jobs(uuid)') is null
     or to_regprocedure(
       'rosetta_v2513.v2528_run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)') is null then
    raise exception 'truth-first quarantine sweep requires migrations 01 through 06 and the replay substrate'
      using errcode = '55000';
  end if;

  -- Hold the campaign set stable through the install. Without this lock a
  -- prepared campaign could race the preflight immediately before the DDL.
  lock table rosetta_replay.replay_campaign in share mode;

  if exists (
    select 1
    from rosetta_replay.replay_campaign
    where campaign_state in ('prepared','running')
  ) then
    raise exception 'install truth-first quarantine sweep only while no campaign is prepared or running'
      using errcode = '55006';
  end if;
end;
$preflight$;

alter table rosetta_replay.replay_campaign
  add column if not exists attempt_policy text;

update rosetta_replay.replay_campaign
set attempt_policy = 'legacy_retry_chain'
where attempt_policy is null;

alter table rosetta_replay.replay_campaign
  alter column attempt_policy set default 'single_observation_v1',
  alter column attempt_policy set not null;

alter table rosetta_replay.replay_campaign
  drop constraint if exists replay_campaign_attempt_policy_check;
alter table rosetta_replay.replay_campaign
  add constraint replay_campaign_attempt_policy_check
  check (
    attempt_policy in ('legacy_retry_chain','single_observation_v1')
    and (attempt_policy <> 'single_observation_v1' or max_retry_seq = 0));

comment on column rosetta_replay.replay_campaign.attempt_policy is
  'legacy_retry_chain is historical evidence only. single_observation_v1 permits one execution observation per frozen campaign/source and no automatic retry.';

alter table rosetta_replay.replay_attempt
  add column if not exists campaign_id uuid
    references rosetta_replay.replay_campaign(campaign_id);

-- Preserve every historical attempt_identity byte-for-byte. Legacy/manual
-- attempts retain their retry-chain uniqueness; campaign attempts live in a
-- separate campaign/source uniqueness domain.
alter table rosetta_replay.replay_attempt
  drop constraint if exists replay_attempt_attempt_identity_retry_seq_key;
create unique index if not exists replay_attempt_legacy_identity_retry_seq
  on rosetta_replay.replay_attempt(attempt_identity,retry_seq)
  where campaign_id is null;
alter table rosetta_replay.replay_attempt
  drop constraint if exists replay_attempt_campaign_single_observation_check;
alter table rosetta_replay.replay_attempt
  add constraint replay_attempt_campaign_single_observation_check
  check (campaign_id is null or retry_seq = 0);
create unique index if not exists replay_attempt_one_per_campaign_source
  on rosetta_replay.replay_attempt(campaign_id,source_registry_id)
  where campaign_id is not null;

comment on column rosetta_replay.replay_attempt.campaign_id is
  'NULL only for legacy attempt history. Truth-first campaigns own exactly one retry_seq=0 attempt for each frozen member.';

create table rosetta_replay.replay_campaign_membership_receipt (
  campaign_id uuid primary key
    references rosetta_replay.replay_campaign(campaign_id),
  snapshot_id uuid not null
    references rosetta_replay.corpus_snapshot_receipt(snapshot_id),
  engine_version text not null,
  rule_set_version text not null,
  closure_prefix text not null,
  closure_hash text not null check (closure_hash ~ '^[0-9a-f]{64}$'),
  member_count integer not null check (member_count > 0),
  total_bytes bigint not null check (total_bytes >= 0),
  membership_sha256 text not null check (membership_sha256 ~ '^[0-9a-f]{64}$'),
  authorization_sha256 text not null check (authorization_sha256 ~ '^[0-9a-f]{64}$'),
  frozen_membership_sha256 text not null
    check (frozen_membership_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  frozen_at timestamptz not null default clock_timestamp()
);

create table rosetta_replay.replay_campaign_member (
  campaign_id uuid not null
    references rosetta_replay.replay_campaign_membership_receipt(campaign_id),
  ordinal integer not null check (ordinal > 0),
  source_registry_id uuid not null
    references rosetta_replay.replay_source_registry(source_registry_id),
  source_content_id uuid not null,
  source_content_hash text not null check (source_content_hash ~ '^[0-9a-f]{64}$'),
  byte_length bigint not null check (byte_length >= 0),
  configuration_hash text not null check (configuration_hash ~ '^[0-9a-f]{64}$'),
  closure_hash text not null check (closure_hash ~ '^[0-9a-f]{64}$'),
  authorization_sha256 text not null check (authorization_sha256 ~ '^[0-9a-f]{64}$'),
  document_class text not null,
  provider_family text not null,
  media_type text not null,
  primary key (campaign_id,source_registry_id),
  unique (campaign_id,ordinal)
);

alter table rosetta_replay.replay_attempt
  drop constraint if exists replay_attempt_campaign_member_fkey;
alter table rosetta_replay.replay_attempt
  add constraint replay_attempt_campaign_member_fkey
  foreign key (campaign_id,source_registry_id)
  references rosetta_replay.replay_campaign_member(
    campaign_id,source_registry_id);
create index if not exists replay_campaign_member_source_lookup
  on rosetta_replay.replay_campaign_member(source_registry_id,campaign_id);

comment on table rosetta_replay.replay_campaign_membership_receipt is
  'Immutable frozen whole-corpus denominator for a truth-first campaign. Historical campaigns are not backfilled or recharacterized.';
comment on table rosetta_replay.replay_campaign_member is
  'Immutable exact source/configuration authorization captured before campaign scheduling.';

alter table rosetta_replay.replay_campaign_membership_receipt enable row level security;
alter table rosetta_replay.replay_campaign_member enable row level security;
revoke all on table
  rosetta_replay.replay_campaign_membership_receipt,
  rosetta_replay.replay_campaign_member
  from public;

create or replace function rosetta_replay.reject_campaign_membership_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'replay_campaign_membership_is_immutable'
    using errcode = 'raise_exception';
end;
$function$;

create or replace function rosetta_replay.lock_frozen_campaign_identity()
returns trigger
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
begin
  if exists (
       select 1
       from rosetta_replay.replay_campaign_membership_receipt receipt
       where receipt.campaign_id = old.campaign_id)
     and (
       new.closure_prefix is distinct from old.closure_prefix
       or new.engine_version is distinct from old.engine_version
       or new.rule_set_version is distinct from old.rule_set_version
       or new.attempt_policy is distinct from old.attempt_policy
       or new.max_retry_seq is distinct from old.max_retry_seq) then
    raise exception 'frozen campaign identity is immutable'
      using errcode = 'P1Q27';
  end if;
  return new;
end;
$function$;

drop trigger if exists replay_campaign_frozen_identity_lock
  on rosetta_replay.replay_campaign;
create trigger replay_campaign_frozen_identity_lock
before update on rosetta_replay.replay_campaign
for each row execute function rosetta_replay.lock_frozen_campaign_identity();

create or replace function rosetta_replay.require_truth_first_campaign_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if new.attempt_policy <> 'single_observation_v1'
     or new.max_retry_seq <> 0 then
    raise exception 'new replay campaigns must use one observation and zero parser retries'
      using errcode = 'P1Q39';
  end if;
  return new;
end;
$function$;

drop trigger if exists replay_campaign_truth_first_insert_guard
  on rosetta_replay.replay_campaign;
create trigger replay_campaign_truth_first_insert_guard
before insert on rosetta_replay.replay_campaign
for each row execute function rosetta_replay.require_truth_first_campaign_insert();

create or replace function rosetta_replay.truth_first_campaign_header_valid(
  p_campaign_id uuid)
returns boolean
language sql stable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
  select exists (
    select 1
    from rosetta_replay.replay_campaign campaign
    join rosetta_replay.replay_campaign_membership_receipt receipt
      on receipt.campaign_id = campaign.campaign_id
     and receipt.engine_version = campaign.engine_version
     and receipt.rule_set_version = campaign.rule_set_version
     and receipt.closure_prefix = campaign.closure_prefix
     and receipt.closure_hash =
       rosetta_replay.closure_sha256(campaign.closure_prefix)
    where campaign.campaign_id = p_campaign_id
      and campaign.attempt_policy = 'single_observation_v1'
      and campaign.max_retry_seq = 0
      and campaign.closure_prefix = 'v2528_'
      and receipt.closure_prefix = 'v2528_'
      and to_regprocedure(
        'rosetta_replay.v2528_reference_date_from_metadata(jsonb)') is not null
      and to_regprocedure(
        'rosetta_v2513.v2528_run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)') is not null
      and receipt.member_count > 0)
$function$;

create or replace function rosetta_replay.truth_first_cluster_token(
  p_value text,
  p_fallback text)
returns text
language plpgsql immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_token text;
begin
  v_token := trim(both '_' from regexp_replace(
    lower(btrim(coalesce(p_value,''))),'[^a-z0-9]+','_','g'));
  if v_token = '' then
    return p_fallback;
  end if;
  if length(v_token) > 64
     or coalesce(p_value,'') ~* 'https?://'
     or v_token ~ '^[0-9a-f]{32,}$'
     or v_token ~ '^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$' then
    return 'other';
  end if;
  return v_token;
end;
$function$;

-- Failure codes are operational data and may contain dynamic text. Aggregate
-- only controlled, generalized buckets so a source/bill identifier can never
-- be copied into the whole-stack review event.
create or replace function rosetta_replay.truth_first_failure_code_bucket(
  p_value text)
returns text
language plpgsql immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_value,'')));
begin
  if v_code = '' then
    return 'none';
  elsif lower(v_code) = 'engine_rejected' then
    return 'engine_rejected';
  elsif lower(v_code) = 'source_text_incomplete' then
    return 'source_text_incomplete';
  elsif lower(v_code) ~ '(^|_)post_base_failure$' then
    return 'post_base_failure';
  elsif lower(v_code) ~ '(^|_)final_validation_failed$' then
    return 'final_validation_failed';
  elsif lower(v_code) = 'worker_lease_expired' then
    return 'worker_lease_expired';
  elsif lower(v_code) = 'parser_deadline_exceeded' then
    return 'parser_deadline_exceeded';
  elsif lower(v_code) in (
    'timeout_observed','retryable_observation','failed_terminal') then
    return lower(v_code);
  elsif v_code = '57014' then
    return 'sqlstate_query_canceled';
  elsif v_code ~ '^08[0-9A-Z]{3}$' then
    return 'sqlstate_connection_exception';
  elsif v_code ~ '^22[0-9A-Z]{3}$' then
    return 'sqlstate_data_exception';
  elsif v_code ~ '^23[0-9A-Z]{3}$' then
    return 'sqlstate_integrity_constraint';
  elsif v_code ~ '^40[0-9A-Z]{3}$' then
    return 'sqlstate_transaction_rollback';
  elsif v_code ~ '^53[0-9A-Z]{3}$' then
    return 'sqlstate_insufficient_resources';
  elsif v_code ~ '^55[0-9A-Z]{3}$' then
    return 'sqlstate_prerequisite_state';
  elsif v_code ~ '^57[0-9A-Z]{3}$' then
    return 'sqlstate_operator_intervention';
  elsif v_code ~ '^P1Q[0-9]{2}$' then
    return 'truth_contract_error';
  elsif v_code ~ '^P1R[0-9]{2}$' then
    return 'replay_integrity_error';
  elsif v_code ~ '^P1C[0-9]{2}$' then
    return 'scheduler_environment_error';
  elsif v_code ~ '^P1A[0-9]{2}$' then
    return 'parser_admissibility_error';
  end if;
  return 'other';
end;
$function$;

alter table rosetta_replay.replay_campaign_event
  drop constraint if exists replay_campaign_event_event_kind_check;
alter table rosetta_replay.replay_campaign_event
  add constraint replay_campaign_event_event_kind_check
  check (event_kind in (
    'started','completed','blocked','stopped',
    'lease_expired','disposition_recorded',
    'warning_10pct','cluster_review_required_15pct'
  ));

create unique index if not exists replay_campaign_threshold_event_once
  on rosetta_replay.replay_campaign_event(campaign_id,event_kind)
  where event_kind in ('warning_10pct','cluster_review_required_15pct');

create or replace function rosetta_replay.block_truth_first_campaign_integrity(
  p_campaign_id uuid,
  p_sqlstate text,
  p_error text,
  p_attempt_id uuid default null)
returns void
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_changed integer;
begin
  update rosetta_replay.replay_campaign
  set campaign_state = 'blocked',
      replay_result = 'nonpass',
      finished_at = clock_timestamp(),
      last_error_code = coalesce(nullif(p_sqlstate,''),'P1Q20'),
      last_error_detail = left(coalesce(nullif(p_error,''),
        'truth-first evidence integrity failed'),4000)
  where campaign_id = p_campaign_id
    and campaign_state in ('prepared','running');
  get diagnostics v_changed = row_count;

  if v_changed = 1 then
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,attempt_id,event_payload)
    values (
      p_campaign_id,'blocked',p_attempt_id,
      jsonb_build_object(
        'sqlstate',coalesce(nullif(p_sqlstate,''),'P1Q20'),
        'error',left(coalesce(nullif(p_error,''),
          'truth-first evidence integrity failed'),4000),
        'failure_scope','campaign_evidence_integrity',
        'fail_closed',true));
  end if;
end;
$function$;

create or replace function rosetta_replay.record_truth_first_disposition(
  p_campaign_id uuid,
  p_source_registry_id uuid,
  p_attempt_id uuid,
  p_disposition text)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  member rosetta_replay.replay_campaign_member%rowtype;
  attempt rosetta_replay.replay_attempt%rowtype;
  binding rosetta_replay.replay_run_binding%rowtype;
  receipt rosetta_replay.replay_receipt%rowtype;
  v_receipt_kind text;
  v_failure_code text;
  v_failure_detail text;
  v_sha text;
  v_id uuid;
  existing rosetta_replay.replay_campaign_source_disposition%rowtype;
begin
  if p_disposition not in (
    'completed','rejected','deferred_oversized',
    'timed_out','retry_exhausted','failed_terminal') then
    raise exception 'unsupported truth-first disposition: %',p_disposition
      using errcode = '22023';
  end if;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.attempt_policy <> 'single_observation_v1'
     or c.max_retry_seq <> 0 then
    raise exception 'campaign % is not single-observation',p_campaign_id
      using errcode = 'P1Q21';
  end if;

  select * into strict member
  from rosetta_replay.replay_campaign_member
  where campaign_id = p_campaign_id
    and source_registry_id = p_source_registry_id;

  select * into strict attempt
  from rosetta_replay.replay_attempt
  where attempt_id = p_attempt_id
  for update;
  if attempt.campaign_id is distinct from p_campaign_id
     or attempt.source_registry_id is distinct from member.source_registry_id
     or attempt.engine_version is distinct from c.engine_version
     or attempt.rule_set_version is distinct from c.rule_set_version
     or attempt.config_hash is distinct from member.configuration_hash
     or attempt.closure_hash is distinct from member.closure_hash
     or attempt.retry_seq <> 0 then
    raise exception 'truth-first disposition is outside frozen campaign membership'
      using errcode = 'P1Q22';
  end if;

  if p_disposition in ('completed','rejected','deferred_oversized') then
    select * into strict binding
    from rosetta_replay.replay_run_binding
    where attempt_id = p_attempt_id
      and source_registry_id = member.source_registry_id
      and source_content_id = member.source_content_id
      and source_content_hash = member.source_content_hash
      and engine_version = c.engine_version
      and rule_set_version = c.rule_set_version
      and configuration_hash = member.configuration_hash
      and closure_hash = member.closure_hash
      and terminal_outcome = p_disposition;
  elsif exists (
    select 1 from rosetta_replay.replay_run_binding b
    where b.attempt_id = p_attempt_id
  ) then
    raise exception 'non-binding disposition conflicts with an exact run binding'
      using errcode = 'P1Q23';
  end if;

  if p_disposition = 'completed' and attempt.attempt_state <> 'succeeded' then
    raise exception 'completed disposition requires succeeded attempt'
      using errcode = 'P1Q24';
  elsif p_disposition = 'rejected' and attempt.attempt_state <> 'rejected' then
    raise exception 'rejected disposition requires rejected attempt'
      using errcode = 'P1Q24';
  elsif p_disposition = 'deferred_oversized'
        and attempt.attempt_state <> 'deferred_oversized' then
    raise exception 'deferred disposition requires deferred attempt'
      using errcode = 'P1Q24';
  elsif p_disposition = 'timed_out'
        and attempt.attempt_state <> 'timed_out' then
    raise exception 'timed-out disposition requires timed-out attempt'
      using errcode = 'P1Q24';
  elsif p_disposition = 'retry_exhausted'
        and attempt.attempt_state <> 'failed_retryable' then
    raise exception 'retryable first observation requires failed-retryable attempt'
      using errcode = 'P1Q24';
  elsif p_disposition = 'failed_terminal'
        and attempt.attempt_state <> 'failed_terminal' then
    raise exception 'failed-terminal disposition requires failed-terminal attempt'
      using errcode = 'P1Q24';
  end if;

  v_receipt_kind := case p_disposition
    when 'completed' then 'success'
    when 'rejected' then 'rejection'
    when 'deferred_oversized' then 'deferred'
    when 'timed_out' then 'timeout'
    when 'retry_exhausted' then 'retryable_failure'
    when 'failed_terminal' then 'terminal_failure'
  end;
  select r.* into strict receipt
  from rosetta_replay.replay_receipt r
  where r.attempt_id = p_attempt_id
    and r.receipt_kind = v_receipt_kind
  order by r.receipt_seq desc
  limit 1;

  v_failure_code := case p_disposition
    when 'rejected' then coalesce(binding.failure_code,receipt.sqlstate,'engine_rejected')
    when 'timed_out' then case receipt.receipt_payload->>'timeout_scope'
      when 'worker_lease' then 'worker_lease_expired'
      when 'caller_armed_execution_statement' then 'parser_deadline_exceeded'
      else coalesce(receipt.sqlstate,'timeout_observed') end
    when 'retry_exhausted' then coalesce(receipt.sqlstate,'retryable_observation')
    when 'failed_terminal' then coalesce(receipt.sqlstate,'failed_terminal')
    else null
  end;
  v_failure_detail := nullif(left(coalesce(receipt.error_detail,''),4000),'');
  v_sha := encode(extensions.digest(convert_to(jsonb_build_object(
    'campaign_id',c.campaign_id,
    'source_registry_id',member.source_registry_id,
    'source_content_id',member.source_content_id,
    'source_content_hash',member.source_content_hash,
    'attempt_id',attempt.attempt_id,
    'receipt_id',receipt.receipt_id,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'configuration_hash',member.configuration_hash,
    'closure_hash',member.closure_hash,
    'retry_seq',0,
    'disposition',p_disposition,
    'failure_code',v_failure_code)::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.replay_campaign_source_disposition (
    campaign_id,source_registry_id,attempt_id,receipt_id,
    source_content_id,source_content_hash,engine_version,rule_set_version,
    configuration_hash,closure_hash,retry_seq,disposition,failure_code,
    failure_detail,disposition_sha256)
  values (
    c.campaign_id,member.source_registry_id,attempt.attempt_id,receipt.receipt_id,
    member.source_content_id,member.source_content_hash,c.engine_version,
    c.rule_set_version,member.configuration_hash,member.closure_hash,0,
    p_disposition,v_failure_code,v_failure_detail,v_sha)
  on conflict (campaign_id,source_registry_id) do nothing
  returning disposition_id into v_id;

  if v_id is null then
    select * into strict existing
    from rosetta_replay.replay_campaign_source_disposition
    where campaign_id = p_campaign_id
      and source_registry_id = p_source_registry_id;
    if existing.attempt_id is distinct from p_attempt_id
       or existing.disposition is distinct from p_disposition
       or existing.disposition_sha256 is distinct from v_sha then
      raise exception 'source has a different immutable campaign disposition'
        using errcode = 'P1Q25';
    end if;
    return existing.disposition_id;
  end if;

  insert into rosetta_replay.replay_campaign_event (
    campaign_id,event_kind,attempt_id,event_payload)
  values (
    p_campaign_id,'disposition_recorded',p_attempt_id,
    jsonb_build_object(
      'source_registry_id',p_source_registry_id,
      'disposition',p_disposition,
      'disposition_sha256',v_sha,
      'single_observation',true));
  return v_id;
end;
$function$;

create or replace function rosetta_replay.enforce_truth_first_disposition_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = new.campaign_id;
  if c.attempt_policy <> 'single_observation_v1' then
    return new;
  end if;
  if not exists (
    select 1
    from rosetta_replay.replay_campaign_member member
    join rosetta_replay.replay_attempt attempt
      on attempt.attempt_id = new.attempt_id
     and attempt.campaign_id = member.campaign_id
     and attempt.source_registry_id = member.source_registry_id
     and attempt.retry_seq = 0
    join rosetta_replay.replay_receipt receipt
      on receipt.receipt_id = new.receipt_id
     and receipt.attempt_id = attempt.attempt_id
    where member.campaign_id = new.campaign_id
      and member.source_registry_id = new.source_registry_id
      and new.source_content_id = member.source_content_id
      and new.source_content_hash = member.source_content_hash
      and new.configuration_hash = member.configuration_hash
      and new.closure_hash = member.closure_hash
      and new.engine_version = c.engine_version
      and new.rule_set_version = c.rule_set_version
      and new.retry_seq = 0
  ) then
    raise exception 'truth-first disposition insert is outside frozen evidence'
      using errcode = 'P1Q26';
  end if;
  return new;
end;
$function$;

drop trigger if exists replay_campaign_disposition_truth_guard
  on rosetta_replay.replay_campaign_source_disposition;
create trigger replay_campaign_disposition_truth_guard
before insert on rosetta_replay.replay_campaign_source_disposition
for each row execute function rosetta_replay.enforce_truth_first_disposition_insert();

create or replace function rosetta_replay.truth_first_campaign_reap_expired(
  p_campaign_id uuid,
  p_limit integer default 128)
returns integer
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  expired record;
  v_receipt uuid;
  v_count integer := 0;
begin
  if p_limit < 1 or p_limit > 1024 then
    raise exception 'expired-attempt reap limit must be between 1 and 1024'
      using errcode = '22023';
  end if;
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.campaign_state <> 'running' then
    return 0;
  end if;

  for expired in
    select attempt.attempt_id,attempt.source_registry_id,
           attempt.lease_expires_at
    from rosetta_replay.replay_attempt attempt
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = p_campaign_id
     and member.source_registry_id = attempt.source_registry_id
    where attempt.campaign_id = p_campaign_id
      and attempt.retry_seq = 0
      and attempt.attempt_state in ('claimed','running')
      and attempt.pending_outcome is null
      and attempt.lease_expires_at is not null
      and attempt.lease_expires_at <= clock_timestamp()
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.source_registry_id = attempt.source_registry_id)
    order by attempt.lease_expires_at,attempt.attempt_id
    limit p_limit
    for update of attempt skip locked
  loop
    v_receipt := rosetta_replay.finalize_attempt(
      expired.attempt_id,'timeout','57014',
      'worker lease expired before a terminal outcome was staged',
      c.worker_identity,
      jsonb_build_object(
        'timeout_scope','worker_lease',
        'campaign_id',p_campaign_id,
        'single_observation',true,
        'lease_expires_at',expired.lease_expires_at));
    perform rosetta_replay.record_truth_first_disposition(
      p_campaign_id,expired.source_registry_id,expired.attempt_id,'timed_out');
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,attempt_id,event_payload)
    values (
      p_campaign_id,'lease_expired',expired.attempt_id,
      jsonb_build_object(
        'source_registry_id',expired.source_registry_id,
        'receipt_id',v_receipt,
        'retry_seq',0,
        'quarantined',true));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function rosetta_replay.truth_first_campaign_sync_dispositions(
  p_campaign_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  candidate record;
  v_disposition text;
  v_count integer := 0;
begin
  for candidate in
    select member.source_registry_id,
           attempt.attempt_id,
           attempt.attempt_state,
           binding.terminal_outcome
    from rosetta_replay.replay_campaign_member member
    left join rosetta_replay.replay_attempt attempt
      on attempt.campaign_id = member.campaign_id
     and attempt.source_registry_id = member.source_registry_id
     and attempt.retry_seq = 0
    left join rosetta_replay.replay_run_binding binding
      on binding.attempt_id = attempt.attempt_id
     and binding.source_registry_id = member.source_registry_id
    where member.campaign_id = p_campaign_id
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = member.campaign_id
          and disposition.source_registry_id = member.source_registry_id)
    order by member.ordinal
  loop
    v_disposition := case
      when candidate.terminal_outcome is not null
        then candidate.terminal_outcome
      when candidate.attempt_state = 'timed_out'
        then 'timed_out'
      when candidate.attempt_state = 'failed_retryable'
        then 'retry_exhausted'
      when candidate.attempt_state = 'failed_terminal'
        then 'failed_terminal'
      else null
    end;
    if v_disposition is not null then
      perform rosetta_replay.record_truth_first_disposition(
        p_campaign_id,candidate.source_registry_id,
        candidate.attempt_id,v_disposition);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

create or replace function rosetta_replay.truth_first_campaign_claim_refill(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  source record;
  v_inflight integer;
  v_need integer;
  v_claimed integer := 0;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;
  if c.campaign_state <> 'running' then
    return jsonb_build_object(
      'phase','claim','claimed',0,'state',c.campaign_state);
  end if;
  if c.attempt_policy <> 'single_observation_v1'
     or not rosetta_replay.truth_first_campaign_header_valid(p_campaign_id) then
    raise exception 'campaign % frozen membership is absent or invalid',p_campaign_id
      using errcode = 'P1Q07';
  end if;

  select count(*) into v_inflight
  from rosetta_replay.replay_attempt attempt
  where attempt.campaign_id = p_campaign_id
    and attempt.attempt_state in ('claimed','running')
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.source_registry_id = attempt.source_registry_id);
  v_need := greatest(c.queue_depth - v_inflight,0);

  for source in
    select member.source_registry_id
    from rosetta_replay.replay_campaign_member member
    where member.campaign_id = p_campaign_id
      and not exists (
        select 1 from rosetta_replay.replay_attempt attempt
        where attempt.campaign_id = member.campaign_id
          and attempt.source_registry_id = member.source_registry_id)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = member.campaign_id
          and disposition.source_registry_id = member.source_registry_id)
    order by member.ordinal
    limit v_need
  loop
    perform rosetta_replay.replay_campaign_claim_source(
      p_campaign_id,source.source_registry_id);
    v_claimed := v_claimed + 1;
  end loop;

  return jsonb_build_object(
    'phase','claim','claimed',v_claimed,
    'inflight_before',v_inflight,
    'queue_depth',c.queue_depth,
    'single_observation',true);
end;
$function$;

-- Execute what is present. Historical per-source expectations are evidence,
-- never instructions to skip a member or manufacture its outcome. This is the
-- active v2.5.28 runner with that expectation branch deliberately removed.
create or replace function rosetta_replay.truth_first_replay_execute(
  p_attempt_id uuid,
  p_closure_prefix text,
  p_timeout_ms integer default 120000)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  attempt rosetta_replay.replay_attempt%rowtype;
  frozen_member rosetta_replay.replay_campaign_member%rowtype;
  source rosetta_replay.replay_source_registry%rowtype;
  content rosetta_v2513.source_document_content%rowtype;
  v_result jsonb;
  v_sqlstate text;
  v_caught_sqlstate text;
  v_error text;
  v_outcome text;
  v_reference_date date;
  v_stage text := 'preflight';
  v_statement_timeout_ms numeric;
begin
  select * into strict attempt
  from rosetta_replay.replay_attempt
  where attempt_id = p_attempt_id
  for update;
  if attempt.campaign_id is null
     or attempt.retry_seq <> 0
     or attempt.attempt_state <> 'running'
     or attempt.pending_outcome is not null then
    raise exception 'attempt % is not an unstaged truth-first campaign attempt',
      p_attempt_id using errcode = 'P1Q29';
  end if;
  if not exists (
    select 1
    from rosetta_replay.replay_campaign_member member
    join rosetta_replay.replay_campaign campaign
      on campaign.campaign_id = member.campaign_id
     and campaign.attempt_policy = 'single_observation_v1'
    where member.campaign_id = attempt.campaign_id
      and member.source_registry_id = attempt.source_registry_id
      and member.configuration_hash = attempt.config_hash
      and member.closure_hash = attempt.closure_hash
      and campaign.closure_prefix = p_closure_prefix
      and campaign.engine_version = attempt.engine_version
      and campaign.rule_set_version = attempt.rule_set_version
  ) then
    raise exception 'attempt % is outside frozen campaign membership',p_attempt_id
      using errcode = 'P1Q30';
  end if;
  select * into strict frozen_member
  from rosetta_replay.replay_campaign_member member
  where member.campaign_id = attempt.campaign_id
    and member.source_registry_id = attempt.source_registry_id;
  if p_closure_prefix <> 'v2528_'
     or to_regprocedure(
       'rosetta_replay.v2528_reference_date_from_metadata(jsonb)') is null
     or to_regprocedure(
       'rosetta_v2513.v2528_run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)') is null then
    raise exception 'migration 07 runner requires the installed v2528 closure'
      using errcode = 'P1Q31';
  end if;
  if attempt.closure_hash is distinct from
       rosetta_replay.closure_sha256(p_closure_prefix)
     or attempt.config_hash is distinct from
       rosetta_replay.expected_configuration_hash(
         attempt.source_registry_id) then
    raise exception 'frozen attempt identity no longer matches active closure/configuration'
      using errcode = 'P1R19';
  end if;

  select * into strict source
  from rosetta_replay.replay_source_registry
  where source_registry_id = attempt.source_registry_id;
  if source.source_content_id is distinct from frozen_member.source_content_id
     or source.source_content_hash is distinct from frozen_member.source_content_hash
     or source.source_byte_length is distinct from frozen_member.byte_length then
    raise exception 'registered source differs from frozen campaign member'
      using errcode = 'P1Q30';
  end if;
  select * into strict content
  from rosetta_v2513.source_document_content candidate_content
  where candidate_content.source_content_id = source.source_content_id
    and candidate_content.source_content_hash = source.source_content_hash;

  -- statement_timeout must be armed by the caller in a prior SQL statement.
  -- Changing it inside this already-running function would not time-bound the
  -- candidate invocation that follows.
  if p_timeout_ms is distinct from 120000 then
    raise exception 'truth-first executor requires the source-locked 120000 ms parser boundary'
      using errcode = '22023';
  end if;
  v_statement_timeout_ms := extract(epoch from
    current_setting('statement_timeout')::interval) * 1000;
  if v_statement_timeout_ms is distinct from p_timeout_ms::numeric then
    raise exception 'truth-first executor requires a caller-armed statement timeout exactly equal to % ms',
      p_timeout_ms using errcode = 'P1Q42';
  end if;
  begin
    v_reference_date :=
      rosetta_replay.v2528_reference_date_from_metadata(content.source_metadata);
    v_stage := 'candidate_invocation';
    execute format(
      'select rosetta_v2513.%Irun_rosetta_v3_extraction_v2511_candidate('
      'c.source_document_id,c.source_text,c.source_content_hash,c.source_url,'
      'c.source_version,c.media_type,c.source_byte_hash,c.source_provider_hash,'
      '$3::date,'
      'coalesce(nullif(c.source_metadata->>''text_extractor_version'',''''),''plain-text-1''),'
      'c.source_metadata) from rosetta_v2513.source_document_content c '
      'where c.source_content_id=$1 and c.source_content_hash=$2',
      p_closure_prefix)
    into v_result
    using source.source_content_id,source.source_content_hash,v_reference_date;
    v_stage := 'receipt_validation';

    if v_result is null then
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R21';
      v_error := 'candidate returned null';
    elsif (v_result->>'source_content_id')::uuid
            is distinct from source.source_content_id
       or (v_result->>'source_document_id')::integer
            is distinct from content.source_document_id
       or v_result->>'source_content_hash' is distinct from source.source_content_hash
       or v_result->>'engine_version' is distinct from attempt.engine_version
       or v_result->>'rule_set_version' is distinct from attempt.rule_set_version
       or v_result->>'configuration_hash' is distinct from attempt.config_hash then
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R22';
      v_error := 'candidate receipt identity differs from frozen attempt';
    elsif v_result->>'run_status' = 'failed'
       and v_result->>'admissibility_state' = 'rejected' then
      v_outcome := 'rejection';
      v_sqlstate := coalesce(
        nullif(v_result->>'failure_code',''),'engine_rejected');
      v_error := v_sqlstate;
    elsif v_result->>'run_status' in ('completed','validated')
       and v_result->>'admissibility_state' = 'admissible'
       and nullif(v_result->>'extraction_run_id','') is not null
       and nullif(v_result->>'output_content_hash','') is not null then
      v_outcome := 'success';
      v_sqlstate := null;
      v_error := null;
    else
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R23';
      v_error := 'candidate returned incomplete or unrecognized terminal receipt';
    end if;
    update rosetta_replay.replay_attempt
    set pending_outcome = v_outcome,
        pending_sqlstate = v_sqlstate,
        pending_error_detail = left(coalesce(v_error,''),4000),
        lease_expires_at = clock_timestamp() + interval '1 minute',
        pending_payload = jsonb_build_object(
          'result',v_result,
          'closure_prefix',p_closure_prefix,
          'historical_expectation_is_advisory',true)
    where attempt_id = p_attempt_id;
  exception
    when query_canceled then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      update rosetta_replay.replay_attempt
      set pending_outcome = 'timeout',
          pending_sqlstate = v_sqlstate,
          pending_error_detail = left(coalesce(v_error,''),4000),
          lease_expires_at = clock_timestamp() + interval '1 minute',
          pending_payload = jsonb_build_object(
            'result',v_result,
            'timeout_ms',p_timeout_ms,
            'timeout_scope','caller_armed_execution_statement',
            'historical_expectation_is_advisory',true)
      where attempt_id = p_attempt_id;
    when others then
      get stacked diagnostics
        v_caught_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      if v_stage = 'receipt_validation' then
        -- Malformed returned identity is bad evidence, not a legitimate
        -- parser rejection that may be bound as though its receipt matched.
        v_outcome := 'terminal_failure';
        v_sqlstate := 'P1R22';
        v_error := 'candidate receipt validation failed ('
          || coalesce(v_caught_sqlstate,'unknown') || '): '
          || coalesce(v_error,'invalid returned identity');
      else
        v_sqlstate := v_caught_sqlstate;
        v_outcome := case
          when v_sqlstate = '57014' then 'timeout'
          when v_sqlstate = '40P01' or v_sqlstate like '08%'
            or v_sqlstate in (
              '55P03','55P04','53000','53100','53200','53300','53400')
            then 'retryable_failure'
          when v_sqlstate like '22%' or v_sqlstate like '23%'
            or v_sqlstate like 'P1%' or v_sqlstate = 'P0001'
            then 'rejection'
          else 'terminal_failure'
        end;
      end if;
      update rosetta_replay.replay_attempt
      set pending_outcome = v_outcome,
          pending_sqlstate = v_sqlstate,
          pending_error_detail = left(coalesce(v_error,''),4000),
          lease_expires_at = clock_timestamp() + interval '1 minute',
          pending_payload = jsonb_build_object(
            'result',v_result,
            'closure_prefix',p_closure_prefix,
            'failure_stage',v_stage,
            'caught_sqlstate',v_caught_sqlstate,
            'candidate_returned_receipt',v_result is not null,
            'exception_before_terminal_engine_receipt',
              v_stage <> 'receipt_validation',
            'historical_expectation_is_advisory',true)
      where attempt_id = p_attempt_id;
  end;
  return jsonb_build_object(
    'attempt_id',p_attempt_id,
    'pending_outcome',(
      select pending_outcome
      from rosetta_replay.replay_attempt
      where attempt_id = p_attempt_id));
exception
  when query_canceled then
    -- Only the inner candidate-invocation block may classify a cancellation
    -- as an observed parser timeout. A cancellation while waiting on the
    -- preflight row lock is infrastructure evidence; rethrow it without
    -- overwriting an outcome another executor may just have committed.
    raise;
end;
$function$;

-- The Render manifest worker predates snapshot-backed replay campaigns. Keep
-- that bounded/manual surface separate, but give it the same truth contract:
-- exact sealed membership, one retry_seq=0 observation, no expected-outcome
-- branch, and an observed-outcome binding. Legacy replay_* functions remain
-- available only as historical/manual compatibility APIs.
create or replace function rosetta_replay.truth_observation_configuration_hash(
  p_source_registry_id uuid)
returns text
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  content rosetta_v2513.source_document_content%rowtype;
  v_config jsonb;
  v_reference_date date;
  v_validated_reference_date date;
  v_reference_date_status text;
  v_text_extractor_version text;
  v_runner_definition text;
begin
  select candidate_content.* into strict content
  from rosetta_replay.replay_source_registry source
  join rosetta_v2513.source_document_content candidate_content
    on candidate_content.source_content_id = source.source_content_id
   and candidate_content.source_content_hash = source.source_content_hash
  where source.source_registry_id = p_source_registry_id;

  begin
    if content.source_metadata->>'reference_date'
         ~ '^\d{4}-\d{2}-\d{2}$' then
      v_reference_date := (content.source_metadata->>'reference_date')::date;
    end if;
  exception
    when sqlstate '22007' or sqlstate '22008' then
      -- The execution boundary will record the malformed value as that
      -- source's observed rejection. Claiming the source must not abort the
      -- rest of the sealed manifest.
      v_reference_date := null;
  end;
  v_text_extractor_version := coalesce(
    nullif(content.source_metadata->>'text_extractor_version',''),
    'plain-text-1');
  v_text_extractor_version := coalesce(
    nullif(btrim(v_text_extractor_version),''),'unknown');

  select pg_get_functiondef(to_regprocedure(
      'rosetta_v2513.v2513_run_rosetta_v3_extraction_v2511_base('
      || 'integer,text,text,text,text,text,text,text,date,text,jsonb)'))
    into v_runner_definition;
  if v_runner_definition is null then
    raise exception 'v2.5.13 candidate base runner is not installed'
      using errcode = 'P1Q44';
  end if;

  -- Two source-locked v2.5.13 closures exist in the deployment lineage. The
  -- repair packet includes acquisition provenance in the configuration hash;
  -- the older installed closure validates the date and records only its
  -- normalized value. The already-computed closure hash keeps those engines
  -- distinct. Derive the configuration identity from the exact installed
  -- function so a result can only bind to the closure that actually ran.
  if position('''reference_date_receipt'',' in v_runner_definition) > 0 then
    v_config := jsonb_build_object(
      'reference_date',v_reference_date,
      'reference_date_receipt',coalesce(
        content.source_metadata->'reference_date_receipt',
        content.source_metadata#>'{registered_metadata,reference_date_receipt}',
        'null'::jsonb),
      'text_extractor_version',v_text_extractor_version,
      'normalization_version','rosetta-normalize-whitespace-v2',
      'parsing_projection_version','rosetta-layout-projection-v25',
      'confidence_mode','binary_exact_match_only');
  else
    v_validated_reference_date := case
      when rosetta_v2513.v2513_rosetta_v25_validate_reference_date(
             v_reference_date)
        then v_reference_date
      else null end;
    v_reference_date_status := case
      when v_reference_date is null then 'absent'
      when v_validated_reference_date is null then 'invalid_temporal'
      else 'valid' end;
    v_config := jsonb_build_object(
      'reference_date',v_validated_reference_date,
      'text_extractor_version',v_text_extractor_version,
      'normalization_version','rosetta-normalize-whitespace-v2',
      'parsing_projection_version','rosetta-layout-projection-v25',
      'confidence_mode','binary_exact_match_only')
      || case when v_reference_date_status = 'invalid_temporal'
        then jsonb_build_object(
          'reference_date_status',v_reference_date_status)
        else '{}'::jsonb end;
  end if;
  return encode(extensions.digest(
    convert_to(v_config::text,'UTF8'),'sha256'),'hex');
end;
$function$;

create or replace function rosetta_replay.truth_observation_claim(
  p_manifest_id uuid,
  p_source_registry_id uuid,
  p_closure_prefix text,
  p_engine_version text,
  p_rule_set_version text,
  p_config_hash text,
  p_closure_hash text,
  p_worker_identity text,
  p_lease interval default interval '5 minutes')
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $function$
declare
  member rosetta_replay.sealed_corpus_member%rowtype;
  source rosetta_replay.replay_source_registry%rowtype;
  attempt rosetta_replay.replay_attempt%rowtype;
  v_identity text;
  v_created boolean := false;
begin
  if not rosetta_replay.verify_sealed_manifest(p_manifest_id) then
    raise exception 'truth observation requires an intact sealed manifest'
      using errcode = 'P1Q44';
  end if;
  if p_lease is null or p_lease <= interval '0 seconds'
     or nullif(btrim(coalesce(p_worker_identity,'')),'') is null then
    raise exception 'truth observation requires a worker identity and positive lease'
      using errcode = '22023';
  end if;
  if p_closure_prefix <> 'v2513_' then
    raise exception 'sealed-manifest truth observation requires v2513 closure'
      using errcode = '22023';
  end if;
  if p_engine_version is distinct from
       'rosetta-v3-deterministic-sql-2.5.13'
     or p_rule_set_version is distinct from
       'rosetta-five-layer-structural-correctness-2.5.13' then
    raise exception
      'sealed-manifest truth observation requires the exact v2.5.13 engine/ruleset'
      using errcode = 'P1R15';
  end if;

  select * into strict member
  from rosetta_replay.sealed_corpus_member sealed_member
  where sealed_member.manifest_id = p_manifest_id
    and sealed_member.source_registry_id = p_source_registry_id;
  select * into strict source
  from rosetta_replay.replay_source_registry registered_source
  where registered_source.source_registry_id = p_source_registry_id;
  if source.source_content_id is distinct from member.source_content_id
     or source.source_content_hash is distinct from member.source_content_hash
     or source.source_byte_length is distinct from member.byte_length then
    raise exception 'registered source differs from sealed manifest member'
      using errcode = 'P1Q44';
  end if;
  if p_config_hash is distinct from
       rosetta_replay.truth_observation_configuration_hash(
         p_source_registry_id) then
    raise exception 'truth-observation configuration hash mismatch'
      using errcode = 'P1R13';
  end if;
  if p_closure_hash is distinct from
       rosetta_replay.closure_sha256(p_closure_prefix) then
    raise exception 'truth-observation closure hash mismatch'
      using errcode = 'P1R14';
  end if;
  if not exists (
    select 1
    from rosetta_v2513.extraction_rule_manifest rule_manifest
    where rule_manifest.engine_version = p_engine_version
      and rule_manifest.rule_set_version = p_rule_set_version
      and rule_manifest.is_active
  ) then
    raise exception 'truth-observation engine/rule manifest is not active'
      using errcode = 'P1R15';
  end if;

  v_identity := p_source_registry_id::text || '|' || p_engine_version || '|'
    || p_rule_set_version || '|' || p_config_hash || '|' || p_closure_hash;
  perform pg_advisory_xact_lock(hashtextextended(v_identity,0));

  if exists (
    select 1
    from rosetta_replay.replay_attempt legacy_retry
    where legacy_retry.campaign_id is null
      and legacy_retry.attempt_identity = v_identity
      and legacy_retry.retry_seq <> 0
  ) then
    raise exception
      'legacy retry chain exists for this exact observation identity; parser will not run again'
      using errcode = 'P1Q46';
  end if;

  select existing.* into attempt
  from rosetta_replay.replay_attempt existing
  where existing.campaign_id is null
    and existing.attempt_identity = v_identity
    and existing.retry_seq = 0
  for update;
  if found then
    if not exists (
      select 1
      from rosetta_replay.replay_receipt receipt
      where receipt.attempt_id = attempt.attempt_id
        and receipt.receipt_kind = 'claim'
        and receipt.receipt_payload->>'manifest_id' = p_manifest_id::text
        and (receipt.receipt_payload->>'single_observation')::boolean
    ) then
      insert into rosetta_replay.replay_receipt (
        attempt_id,receipt_kind,worker_identity,receipt_payload)
      values (
        attempt.attempt_id,'claim',btrim(p_worker_identity),
        jsonb_build_object(
          'manifest_id',p_manifest_id,
          'retry_seq',0,
          'single_observation',true,
          'reused_exact_attempt',true,
          'parser_invoked',false));
    end if;
    return jsonb_build_object(
      'attempt_id',attempt.attempt_id,
      'attempt_state',attempt.attempt_state,
      'created',false,
      'single_observation',true,
      'parser_invoked',false);
  end if;

  insert into rosetta_replay.replay_attempt (
    source_registry_id,engine_version,rule_set_version,config_hash,closure_hash,
    retry_seq,attempt_state,worker_identity,lease_expires_at,started_at)
  values (
    p_source_registry_id,p_engine_version,p_rule_set_version,p_config_hash,
    p_closure_hash,0,'running',btrim(p_worker_identity),
    clock_timestamp() + p_lease,clock_timestamp())
  on conflict do nothing
  returning * into attempt;
  if not found then
    select existing.* into strict attempt
    from rosetta_replay.replay_attempt existing
    where existing.campaign_id is null
      and existing.attempt_identity = v_identity
      and existing.retry_seq = 0
    for update;
    if not exists (
      select 1
      from rosetta_replay.replay_receipt receipt
      where receipt.attempt_id = attempt.attempt_id
        and receipt.receipt_kind = 'claim'
        and receipt.receipt_payload->>'manifest_id' = p_manifest_id::text
        and (receipt.receipt_payload->>'single_observation')::boolean
    ) then
      insert into rosetta_replay.replay_receipt (
        attempt_id,receipt_kind,worker_identity,receipt_payload)
      values (
        attempt.attempt_id,'claim',btrim(p_worker_identity),
        jsonb_build_object(
          'manifest_id',p_manifest_id,
          'retry_seq',0,
          'single_observation',true,
          'reused_exact_attempt',true,
          'parser_invoked',false));
    end if;
    return jsonb_build_object(
      'attempt_id',attempt.attempt_id,
      'attempt_state',attempt.attempt_state,
      'created',false,
      'single_observation',true,
      'parser_invoked',false);
  end if;
  v_created := true;

  insert into rosetta_replay.replay_receipt (
    attempt_id,receipt_kind,worker_identity,receipt_payload)
  values
    (attempt.attempt_id,'claim',btrim(p_worker_identity),
      jsonb_build_object(
        'manifest_id',p_manifest_id,'retry_seq',0,
        'single_observation',true)),
    (attempt.attempt_id,'start',btrim(p_worker_identity),
      jsonb_build_object(
        'manifest_id',p_manifest_id,'single_observation',true,
        'automatic_retry',false));

  return jsonb_build_object(
    'attempt_id',attempt.attempt_id,
    'attempt_state','running',
    'created',v_created,
    'single_observation',true,
    'parser_invoked',false);
end;
$function$;

create or replace function rosetta_replay.truth_observation_execute(
  p_attempt_id uuid,
  p_manifest_id uuid,
  p_closure_prefix text,
  p_timeout_ms integer default 120000)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  attempt rosetta_replay.replay_attempt%rowtype;
  member rosetta_replay.sealed_corpus_member%rowtype;
  source rosetta_replay.replay_source_registry%rowtype;
  content rosetta_v2513.source_document_content%rowtype;
  v_result jsonb;
  v_sqlstate text;
  v_caught_sqlstate text;
  v_error text;
  v_outcome text;
  v_stage text := 'preflight';
  v_statement_timeout_ms numeric;
  v_failure_class text;
  v_sqlstate_retryable boolean;
begin
  if not rosetta_replay.verify_sealed_manifest(p_manifest_id) then
    raise exception 'truth observation requires an intact sealed manifest'
      using errcode = 'P1Q44';
  end if;
  if p_closure_prefix <> 'v2513_' then
    raise exception 'sealed-manifest truth observation requires v2513 closure'
      using errcode = '22023';
  end if;
  select * into strict attempt
  from rosetta_replay.replay_attempt existing
  where existing.attempt_id = p_attempt_id
  for update;
  if attempt.campaign_id is not null
     or attempt.retry_seq <> 0
     or attempt.attempt_state <> 'running'
     or attempt.pending_outcome is not null
     or attempt.lease_expires_at is null
     or attempt.lease_expires_at <= clock_timestamp() then
    raise exception 'attempt % is not a live unstaged manifest observation',
      p_attempt_id using errcode = 'P1Q44';
  end if;
  select * into strict member
  from rosetta_replay.sealed_corpus_member sealed_member
  where sealed_member.manifest_id = p_manifest_id
    and sealed_member.source_registry_id = attempt.source_registry_id;
  if attempt.closure_hash is distinct from
       rosetta_replay.closure_sha256(p_closure_prefix)
     or attempt.config_hash is distinct from
       rosetta_replay.truth_observation_configuration_hash(
         attempt.source_registry_id) then
    raise exception 'manifest observation no longer matches closure/configuration'
      using errcode = 'P1R19';
  end if;
  if attempt.engine_version is distinct from
       'rosetta-v3-deterministic-sql-2.5.13'
     or attempt.rule_set_version is distinct from
       'rosetta-five-layer-structural-correctness-2.5.13' then
    raise exception
      'manifest observation identity is not the exact v2.5.13 runner'
      using errcode = 'P1R15';
  end if;
  if not exists (
    select 1
    from rosetta_v2513.extraction_rule_manifest rule_manifest
    where rule_manifest.engine_version = attempt.engine_version
      and rule_manifest.rule_set_version = attempt.rule_set_version
      and rule_manifest.is_active
  ) then
    raise exception 'manifest observation engine/rule manifest is not active'
      using errcode = 'P1R15';
  end if;
  if to_regprocedure(
       'rosetta_v2513.' || p_closure_prefix
       || 'run_rosetta_v3_extraction_v2511_candidate('
       || 'integer,text,text,text,text,text,text,text,date,text,jsonb)') is null then
    raise exception 'manifest observation runner is not installed for closure %',
      p_closure_prefix using errcode = 'P1Q44';
  end if;

  select * into strict source
  from rosetta_replay.replay_source_registry registered_source
  where registered_source.source_registry_id = attempt.source_registry_id;
  if source.source_content_id is distinct from member.source_content_id
     or source.source_content_hash is distinct from member.source_content_hash
     or source.source_byte_length is distinct from member.byte_length then
    raise exception 'registered source differs from sealed manifest member'
      using errcode = 'P1Q44';
  end if;
  select * into strict content
  from rosetta_v2513.source_document_content candidate_content
  where candidate_content.source_content_id = source.source_content_id
    and candidate_content.source_content_hash = source.source_content_hash;

  -- This timeout has to be armed by the caller in a prior statement. It is a
  -- parser boundary, not a retry timer.
  if p_timeout_ms is distinct from 120000 then
    raise exception 'truth observation requires the source-locked 120000 ms parser boundary'
      using errcode = '22023';
  end if;
  v_statement_timeout_ms := extract(epoch from
    current_setting('statement_timeout')::interval) * 1000;
  if v_statement_timeout_ms is distinct from p_timeout_ms::numeric then
    raise exception 'truth observation requires a caller-armed statement timeout exactly equal to % ms',
      p_timeout_ms using errcode = 'P1Q42';
  end if;

  begin
    v_stage := 'candidate_invocation';
    execute format(
      'select rosetta_v2513.%Irun_rosetta_v3_extraction_v2511_candidate('
      'c.source_document_id,c.source_text,c.source_content_hash,c.source_url,'
      'c.source_version,c.media_type,c.source_byte_hash,c.source_provider_hash,'
      'case when c.source_metadata->>''reference_date'' ~ ''^\d{4}-\d{2}-\d{2}$'' '
      'then (c.source_metadata->>''reference_date'')::date else null end,'
      'coalesce(nullif(c.source_metadata->>''text_extractor_version'',''''),''plain-text-1''),'
      'c.source_metadata) from rosetta_v2513.source_document_content c '
      'where c.source_content_id=$1 and c.source_content_hash=$2',
      p_closure_prefix)
    into v_result
    using source.source_content_id,source.source_content_hash;
    v_stage := 'receipt_validation';

    if v_result is null then
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R21';
      v_error := 'candidate returned null';
    elsif (v_result->>'source_content_id')::uuid
            is distinct from source.source_content_id
       or (v_result->>'source_document_id')::integer
            is distinct from content.source_document_id
       or v_result->>'source_content_hash' is distinct from source.source_content_hash
       or v_result->>'engine_version' is distinct from attempt.engine_version
       or v_result->>'rule_set_version' is distinct from attempt.rule_set_version
       or v_result->>'configuration_hash' is distinct from attempt.config_hash then
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R22';
      v_error := 'candidate receipt identity differs from sealed observation';
    elsif v_result->>'run_status' = 'failed'
       and v_result->>'admissibility_state' = 'rejected' then
      v_outcome := 'rejection';
      v_sqlstate := coalesce(
        nullif(v_result->>'failure_code',''),'engine_rejected');
      v_error := v_sqlstate;
    elsif v_result->>'run_status' in ('completed','validated')
       and v_result->>'admissibility_state' = 'admissible'
       and nullif(v_result->>'extraction_run_id','') is not null
       and nullif(v_result->>'output_content_hash','') is not null then
      v_outcome := 'success';
      v_sqlstate := null;
      v_error := null;
    else
      v_outcome := 'terminal_failure';
      v_sqlstate := 'P1R23';
      v_error := 'candidate returned incomplete or unrecognized terminal receipt';
    end if;
    update rosetta_replay.replay_attempt
    set pending_outcome = v_outcome,
        pending_sqlstate = v_sqlstate,
        pending_error_detail = left(coalesce(v_error,''),4000),
        lease_expires_at = clock_timestamp() + interval '1 minute',
        pending_payload = jsonb_build_object(
          'result',v_result,
          'manifest_id',p_manifest_id,
          'closure_prefix',p_closure_prefix,
          'historical_expectation_is_advisory',true,
          'single_observation',true,
          'automatic_retry',false)
    where attempt_id = p_attempt_id;
  exception
    when query_canceled then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      update rosetta_replay.replay_attempt
      set pending_outcome = 'timeout',
          pending_sqlstate = v_sqlstate,
          pending_error_detail = left(coalesce(v_error,''),4000),
          lease_expires_at = clock_timestamp() + interval '1 minute',
          pending_payload = jsonb_build_object(
            'result',v_result,
            'manifest_id',p_manifest_id,
            'timeout_ms',p_timeout_ms,
            'timeout_scope','caller_armed_execution_statement',
            'historical_expectation_is_advisory',true,
            'single_observation',true,
            'automatic_retry',false)
      where attempt_id = p_attempt_id;
    when others then
      get stacked diagnostics
        v_caught_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      select failure.failure_class,failure.is_retryable
        into v_failure_class,v_sqlstate_retryable
      from rosetta_replay.classify_failure(v_caught_sqlstate) failure;
      if v_stage = 'receipt_validation' then
        v_outcome := 'terminal_failure';
        v_sqlstate := 'P1R22';
        v_error := 'candidate receipt validation failed ('
          || coalesce(v_caught_sqlstate,'unknown') || '): '
          || coalesce(v_error,'invalid returned identity');
      else
        v_sqlstate := v_caught_sqlstate;
        v_outcome := case
          when v_sqlstate = '57014' then 'timeout'
          when v_sqlstate like '22%' or v_sqlstate like '23%'
            or v_sqlstate like 'P1%' or v_sqlstate = 'P0001'
            then 'rejection'
          else 'terminal_failure'
        end;
      end if;
      update rosetta_replay.replay_attempt
      set pending_outcome = v_outcome,
          pending_sqlstate = v_sqlstate,
          pending_error_detail = left(coalesce(v_error,''),4000),
          lease_expires_at = clock_timestamp() + interval '1 minute',
          pending_payload = jsonb_build_object(
            'result',v_result,
            'manifest_id',p_manifest_id,
            'closure_prefix',p_closure_prefix,
            'failure_stage',v_stage,
            'caught_sqlstate',v_caught_sqlstate,
            'failure_class',v_failure_class,
            'sqlstate_was_retryable',v_sqlstate_retryable,
            'candidate_returned_receipt',v_result is not null,
            'exception_before_terminal_engine_receipt',
              v_stage <> 'receipt_validation',
            'historical_expectation_is_advisory',true,
            'single_observation',true,
            'automatic_retry',false)
      where attempt_id = p_attempt_id;
  end;
  return jsonb_build_object(
    'attempt_id',p_attempt_id,
    'manifest_id',p_manifest_id,
    'pending_outcome',(
      select pending_outcome
      from rosetta_replay.replay_attempt
      where attempt_id = p_attempt_id),
    'parser_invoked',true,
    'automatic_retry',false);
exception
  when query_canceled then
    -- A preflight/lock cancellation does not prove a parser timeout. Rethrow
    -- without touching the row; an expired unstaged lease is later recorded
    -- as invocation-ambiguous and is never rerun.
    raise;
end;
$function$;

create or replace function rosetta_replay.truth_observation_finalize(
  p_attempt_id uuid,
  p_manifest_id uuid,
  p_worker_identity text default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  attempt rosetta_replay.replay_attempt%rowtype;
  member rosetta_replay.sealed_corpus_member%rowtype;
  source rosetta_replay.replay_source_registry%rowtype;
  v_prior_sqlstate text;
  v_prior_error text;
  v_prior_payload jsonb;
  v_receipt uuid;
begin
  if not rosetta_replay.verify_sealed_manifest(p_manifest_id) then
    raise exception 'truth observation requires an intact sealed manifest'
      using errcode = 'P1Q44';
  end if;
  select * into strict attempt
  from rosetta_replay.replay_attempt existing
  where existing.attempt_id = p_attempt_id
  for update;
  select * into strict member
  from rosetta_replay.sealed_corpus_member sealed_member
  where sealed_member.manifest_id = p_manifest_id
    and sealed_member.source_registry_id = attempt.source_registry_id;
  select * into strict source
  from rosetta_replay.replay_source_registry registered_source
  where registered_source.source_registry_id = attempt.source_registry_id;
  if attempt.campaign_id is not null
     or attempt.retry_seq <> 0
     or attempt.engine_version is distinct from
          'rosetta-v3-deterministic-sql-2.5.13'
     or attempt.rule_set_version is distinct from
          'rosetta-five-layer-structural-correctness-2.5.13'
     or attempt.config_hash is distinct from
          rosetta_replay.truth_observation_configuration_hash(
            attempt.source_registry_id)
     or attempt.closure_hash is distinct from
          rosetta_replay.closure_sha256('v2513_')
     or not exists (
       select 1
       from rosetta_replay.replay_receipt claim_receipt
       where claim_receipt.attempt_id = attempt.attempt_id
         and claim_receipt.receipt_kind = 'claim'
         and claim_receipt.receipt_payload->>'manifest_id' =
               p_manifest_id::text
         and (claim_receipt.receipt_payload->>'single_observation')::boolean)
     or source.source_content_id is distinct from member.source_content_id
     or source.source_content_hash is distinct from member.source_content_hash
     or source.source_byte_length is distinct from member.byte_length then
    raise exception 'attempt is outside the sealed manifest observation'
      using errcode = 'P1Q44';
  end if;

  -- A legacy retryable row is not terminal corpus evidence. Preserve its
  -- original failure receipt, suppress any further retry, and seal it as an
  -- explicit terminal quarantine before the worker counts it.
  if attempt.attempt_state = 'failed_retryable'
     and attempt.pending_outcome is null then
    select receipt.sqlstate,receipt.error_detail,receipt.receipt_payload
      into v_prior_sqlstate,v_prior_error,v_prior_payload
    from rosetta_replay.replay_receipt receipt
    where receipt.attempt_id = p_attempt_id
      and receipt.receipt_kind = 'retryable_failure'
    order by receipt.receipt_seq desc
    limit 1;
    return rosetta_replay.finalize_attempt(
      p_attempt_id,'terminal_failure',
      coalesce(v_prior_sqlstate,'P1Q47'),
      coalesce(v_prior_error,
        'legacy retryable observation had no recoverable failure detail'),
      p_worker_identity,
      coalesce(v_prior_payload,'{}'::jsonb)
        || jsonb_build_object(
          'manifest_id',p_manifest_id,
          'original_attempt_state','failed_retryable',
          'retry_suppressed_by','single_observation_v1',
          'parser_rerun',false,
          'single_observation',true,
          'automatic_retry',false));
  end if;

  if attempt.pending_outcome is null then
    if attempt.attempt_state in ('claimed','running')
       and attempt.lease_expires_at is not null
       and attempt.lease_expires_at <= clock_timestamp() then
      return rosetta_replay.finalize_attempt(
        p_attempt_id,'terminal_failure','P1Q45',
        'worker lease expired without a committed parser outcome',
        p_worker_identity,jsonb_build_object(
          'manifest_id',p_manifest_id,
          'hard_backend_crash_before_committed_outcome','invocation_ambiguous',
          'parser_rerun',false,
          'single_observation',true,
          'automatic_retry',false));
    end if;
    raise exception 'attempt has no committed outcome eligible for finalization'
      using errcode = 'P1Q44';
  end if;

  -- Old staged transient failures are preserved, but become terminal
  -- quarantine observations instead of remaining eligible for retry_seq+1.
  if attempt.pending_outcome = 'retryable_failure' then
    update rosetta_replay.replay_attempt
    set pending_outcome = 'terminal_failure',
        pending_payload = coalesce(pending_payload,'{}'::jsonb)
          || jsonb_build_object(
            'original_pending_outcome','retryable_failure',
            'retry_suppressed_by','single_observation_v1',
            'single_observation',true,
            'automatic_retry',false)
    where attempt_id = p_attempt_id;
  end if;

  if position(
       'expectation_is_advisory' in pg_get_functiondef(
         'rosetta_replay.replay_finalize(uuid,text)'::regprocedure)) = 0 then
    raise exception 'observed-outcome finalizer contract is not installed'
      using errcode = 'P1Q44';
  end if;
  v_receipt := rosetta_replay.replay_finalize(
    p_attempt_id,p_worker_identity);
  return v_receipt;
end;
$function$;

create or replace function rosetta_replay.truth_first_campaign_execute_next(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_attempt uuid;
  v_source uuid;
  v_result jsonb;
  v_sqlstate text;
  v_error text;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.campaign_state <> 'running' then
    return jsonb_build_object(
      'phase','execute','processed',0,'state',c.campaign_state);
  end if;

  -- Lease expiry is a transition fence: an expired unstaged row belongs only
  -- to the reaper and can never race back into parser execution.
  select attempt.attempt_id,attempt.source_registry_id
    into v_attempt,v_source
  from rosetta_replay.replay_attempt attempt
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = p_campaign_id
   and member.source_registry_id = attempt.source_registry_id
  where attempt.campaign_id = p_campaign_id
    and attempt.retry_seq = 0
    and attempt.attempt_state = 'running'
    and attempt.pending_outcome is null
    and attempt.lease_expires_at > clock_timestamp()
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.attempt_id = attempt.attempt_id)
  order by member.ordinal
  limit 1
  for update of attempt skip locked;
  if v_attempt is null then
    return jsonb_build_object('phase','execute','processed',0);
  end if;

  begin
    v_result := rosetta_replay.truth_first_replay_execute(
      v_attempt,c.closure_prefix,c.timeout_ms);
  exception
    when query_canceled then
      -- The inner candidate block commits genuine parser timeouts. Any
      -- cancellation escaping it occurred during wrapper/preflight/locking
      -- and is infrastructure evidence, so it must not overwrite the row.
      raise;
    when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_error = message_text;
      perform rosetta_replay.block_truth_first_campaign_integrity(
        p_campaign_id,v_sqlstate,
        'truth-first executor integrity failure: '
          || coalesce(v_error,'unknown executor failure'),v_attempt);
      return jsonb_build_object(
        'phase','execute','processed',0,'attempt_id',v_attempt,
        'campaign_blocked',true,'sqlstate',v_sqlstate);
  end;

  return jsonb_build_object(
    'phase','execute','processed',1,
    'attempt_id',v_attempt,
    'result',v_result);
end;
$function$;

create or replace function rosetta_replay.quarantine_finalize_failure(
  p_campaign_id uuid,
  p_source_registry_id uuid,
  p_attempt_id uuid,
  p_worker_identity text,
  p_sqlstate text,
  p_error text,
  p_staged_outcome text,
  p_staged_sqlstate text,
  p_staged_error text,
  p_staged_payload jsonb)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_receipt uuid;
begin
  v_receipt := rosetta_replay.finalize_attempt(
    p_attempt_id,'terminal_failure',coalesce(nullif(p_sqlstate,''),'P1Q33'),
    left(coalesce(p_error,'source finalization failed'),4000),
    p_worker_identity,
    jsonb_build_object(
      'campaign_id',p_campaign_id,
      'single_observation',true,
      'source_local_finalize_error',true,
      'staged_observed_outcome',p_staged_outcome,
      'staged_sqlstate',p_staged_sqlstate,
      'staged_error_detail',p_staged_error,
      'staged_payload',coalesce(p_staged_payload,'{}'::jsonb)));
  perform rosetta_replay.record_truth_first_disposition(
    p_campaign_id,p_source_registry_id,p_attempt_id,'failed_terminal');
  return jsonb_build_object(
    'phase','finalize','processed',1,
    'attempt_id',p_attempt_id,
    'receipt_id',v_receipt,
    'disposition','failed_terminal',
    'quarantined',true,
    'continued',true,
    'sqlstate',p_sqlstate,
    'staged_observed_outcome',p_staged_outcome);
end;
$function$;

create or replace function rosetta_replay.handle_truth_first_finalize_error(
  p_campaign_id uuid,
  p_source_registry_id uuid,
  p_attempt_id uuid,
  p_worker_identity text,
  p_sqlstate text,
  p_error text,
  p_staged_outcome text,
  p_staged_sqlstate text,
  p_staged_error text,
  p_staged_payload jsonb)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_integrity_state text;
  v_integrity_error text;
begin
  -- Retrying an evidence write does not rerun the parser. Preserve the staged
  -- observation for transient database failures until its existing lease
  -- expires; the supervisor then seals a source-local quarantine from that
  -- committed stage instead of rerunning or looping forever.
  if p_sqlstate = '57014'
     or p_sqlstate = '40P01'
     or p_sqlstate like '08%'
     or p_sqlstate in (
       '55P03','55P04','53000','53100','53200','53300','53400') then
    return jsonb_build_object(
      'phase','finalize','processed',0,
      'attempt_id',p_attempt_id,
      'finalization_retry_deferred',true,
      'parser_rerun',false,
      'sqlstate',p_sqlstate);
  end if;

  -- A malformed or unbindable candidate receipt is an honest source-local
  -- non-success. Preserve its staged observation in the terminal receipt.
  if p_sqlstate in ('P1R25','P1R26') or p_sqlstate like '22%' then
    begin
      return rosetta_replay.quarantine_finalize_failure(
        p_campaign_id,p_source_registry_id,p_attempt_id,p_worker_identity,
        p_sqlstate,p_error,p_staged_outcome,p_staged_sqlstate,
        p_staged_error,p_staged_payload);
    exception when others then
      get stacked diagnostics
        v_integrity_state = returned_sqlstate,
        v_integrity_error = message_text;
      perform rosetta_replay.block_truth_first_campaign_integrity(
        p_campaign_id,v_integrity_state,
        'source finalization evidence could not be sealed: '
          || coalesce(v_integrity_error,'unknown evidence error'),p_attempt_id);
      return jsonb_build_object(
        'phase','finalize','processed',0,'attempt_id',p_attempt_id,
        'campaign_blocked',true,'sqlstate',v_integrity_state);
    end;
  end if;

  perform rosetta_replay.block_truth_first_campaign_integrity(
    p_campaign_id,p_sqlstate,
    'truth-first finalization integrity failure: '
      || coalesce(p_error,'unknown finalization error'),p_attempt_id);
  return jsonb_build_object(
    'phase','finalize','processed',0,'attempt_id',p_attempt_id,
    'campaign_blocked',true,'sqlstate',p_sqlstate);
end;
$function$;

create or replace function rosetta_replay.truth_first_campaign_finalize_next(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_attempt uuid;
  v_source uuid;
  v_state text;
  v_disposition text;
  v_receipt uuid;
  v_sqlstate text;
  v_error text;
  v_pending_outcome text;
  v_pending_sqlstate text;
  v_pending_error text;
  v_pending_payload jsonb;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.campaign_state <> 'running' then
    return jsonb_build_object(
      'phase','finalize','processed',0,'state',c.campaign_state);
  end if;

  -- Lease expiry is also the finalization fence. An expired committed stage
  -- belongs to the supervisor's preserve-and-quarantine path.
  select attempt.attempt_id,attempt.source_registry_id,
         attempt.pending_outcome,attempt.pending_sqlstate,
         attempt.pending_error_detail,attempt.pending_payload
    into v_attempt,v_source,v_pending_outcome,v_pending_sqlstate,
         v_pending_error,v_pending_payload
  from rosetta_replay.replay_attempt attempt
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = p_campaign_id
   and member.source_registry_id = attempt.source_registry_id
  where attempt.campaign_id = p_campaign_id
    and attempt.retry_seq = 0
    and attempt.attempt_state = 'running'
    and attempt.pending_outcome is not null
    and attempt.lease_expires_at > clock_timestamp()
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.attempt_id = attempt.attempt_id)
  order by member.ordinal
  limit 1
  for update of attempt skip locked;
  if v_attempt is null then
    return jsonb_build_object('phase','finalize','processed',0);
  end if;

  begin
    v_receipt := rosetta_replay.replay_finalize(v_attempt,c.worker_identity);
  exception
    when query_canceled then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      return rosetta_replay.handle_truth_first_finalize_error(
        p_campaign_id,v_source,v_attempt,c.worker_identity,
        v_sqlstate,v_error,v_pending_outcome,v_pending_sqlstate,
        v_pending_error,v_pending_payload);
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;
      perform set_config('statement_timeout','0',true);
      return rosetta_replay.handle_truth_first_finalize_error(
        p_campaign_id,v_source,v_attempt,c.worker_identity,
        v_sqlstate,v_error,v_pending_outcome,v_pending_sqlstate,
        v_pending_error,v_pending_payload);
  end;

  select attempt_state into strict v_state
  from rosetta_replay.replay_attempt
  where attempt_id = v_attempt;
  v_disposition := case v_state
    when 'succeeded' then 'completed'
    when 'rejected' then 'rejected'
    when 'deferred_oversized' then 'deferred_oversized'
    when 'timed_out' then 'timed_out'
    when 'failed_retryable' then 'retry_exhausted'
    when 'failed_terminal' then 'failed_terminal'
  end;
  if v_disposition is null then
    raise exception 'attempt % did not reach a dispositionable state',v_attempt
      using errcode = 'P1Q10';
  end if;
  perform rosetta_replay.record_truth_first_disposition(
    p_campaign_id,v_source,v_attempt,v_disposition);

  return jsonb_build_object(
    'phase','finalize','processed',1,
    'attempt_id',v_attempt,
    'receipt_id',v_receipt,
    'disposition',v_disposition,
    'quarantined',v_disposition <> 'completed',
    'continued',true);
end;
$function$;

drop trigger if exists replay_campaign_membership_receipt_immutable
  on rosetta_replay.replay_campaign_membership_receipt;
create trigger replay_campaign_membership_receipt_immutable
before update or delete on rosetta_replay.replay_campaign_membership_receipt
for each row execute function rosetta_replay.reject_campaign_membership_mutation();

drop trigger if exists replay_campaign_member_immutable
  on rosetta_replay.replay_campaign_member;
create trigger replay_campaign_member_immutable
before update or delete on rosetta_replay.replay_campaign_member
for each row execute function rosetta_replay.reject_campaign_membership_mutation();

create or replace function rosetta_replay.guard_campaign_member_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_limit integer;
  v_next integer;
  v_state text;
begin
  select receipt.member_count,campaign.campaign_state
    into strict v_limit,v_state
  from rosetta_replay.replay_campaign_membership_receipt receipt
  join rosetta_replay.replay_campaign campaign
    on campaign.campaign_id = receipt.campaign_id
  where receipt.campaign_id = new.campaign_id;
  select coalesce(max(member.ordinal),0) + 1 into v_next
  from rosetta_replay.replay_campaign_member member
  where member.campaign_id = new.campaign_id;
  if v_state <> 'prepared'
     or new.ordinal <> v_next
     or new.ordinal > v_limit then
    raise exception 'campaign membership is already sealed or overfull'
      using errcode = 'P1Q32';
  end if;
  return new;
end;
$function$;

drop trigger if exists replay_campaign_member_insert_guard
  on rosetta_replay.replay_campaign_member;
create trigger replay_campaign_member_insert_guard
before insert on rosetta_replay.replay_campaign_member
for each row execute function rosetta_replay.guard_campaign_member_insert();

create or replace function rosetta_replay.freeze_replay_campaign_membership(
  p_campaign_id uuid,
  p_snapshot_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  s rosetta_replay.corpus_snapshot_receipt%rowtype;
  v_closure_hash text;
  v_count integer;
  v_bytes bigint;
  v_membership_hash text;
  v_authorization_hash text;
  v_authorization_variants integer;
  v_frozen_membership_hash text;
  v_receipt_hash text;
begin
  -- Freeze from one locked relation state. The source registry is immutable,
  -- but the locks also prevent a concurrent authorization/content insert from
  -- landing between the receipt aggregate and member materialization.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rosetta-truth-first-membership-freeze',0));
  lock table rosetta_replay.corpus_snapshot_receipt in share mode;
  lock table rosetta_replay.candidate_generation_authorization in share mode;
  lock table rosetta_replay.replay_source_registry in share mode;
  lock table rosetta_v2513.source_document_content in share mode;
  lock table rosetta_v2513.source_document in share mode;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;

  if c.attempt_policy <> 'single_observation_v1'
     or c.campaign_state <> 'prepared'
     or c.closure_prefix <> 'v2528_'
     or to_regprocedure(
       'rosetta_replay.v2528_reference_date_from_metadata(jsonb)') is null
     or to_regprocedure(
       'rosetta_v2513.v2528_run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)') is null then
    raise exception 'campaign % is not a prepared single-observation campaign',p_campaign_id
      using errcode = 'P1Q01';
  end if;
  if exists (
    select 1 from rosetta_replay.replay_campaign_membership_receipt
    where campaign_id = p_campaign_id
  ) then
    raise exception 'campaign % membership is already frozen',p_campaign_id
      using errcode = 'P1Q02';
  end if;

  select * into strict s
  from rosetta_replay.corpus_snapshot_receipt
  where snapshot_id = p_snapshot_id;
  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);

  select count(*)::integer,
         coalesce(sum(source.source_byte_length),0)::bigint,
         encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
           source.source_content_id::text,
           source.source_content_hash,
           source.source_byte_length::text),chr(10)
           order by source.source_content_hash,source.source_content_id),'') ,
           'UTF8'),'sha256'),'hex'),
         min(auth.authorization_sha256),
         count(distinct auth.authorization_sha256)::integer
    into v_count,v_bytes,v_membership_hash,
         v_authorization_hash,v_authorization_variants
  from rosetta_replay.candidate_generation_authorization auth
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = auth.source_registry_id
  where auth.snapshot_id = p_snapshot_id
    and auth.engine_version = c.engine_version
    and auth.rule_set_version = c.rule_set_version
    and auth.closure_prefix = c.closure_prefix
    and auth.closure_hash = v_closure_hash
    and auth.authorization_scope = 'full_candidate_generation';

  if v_count <= 0
     or v_count is distinct from s.source_count
     or v_bytes is distinct from s.source_total_bytes
     or v_membership_hash is distinct from s.source_membership_sha256
     or v_authorization_variants <> 1 then
    raise exception 'campaign authorization does not equal immutable snapshot %',p_snapshot_id
      using errcode = 'P1Q03';
  end if;

  with authorized as (
    select row_number() over (
             order by source.source_content_hash,source.source_content_id,
                      source.source_registry_id)::integer as ordinal,
           source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           source.source_byte_length as byte_length,
           rosetta_replay.expected_configuration_hash(
             source.source_registry_id) as configuration_hash,
           v_closure_hash as closure_hash,
           auth.authorization_sha256,
           rosetta_replay.truth_first_cluster_token(coalesce(
             nullif(btrim(document.document_type),''),
             nullif(btrim(content.source_metadata->>'document_class'),''),
             nullif(btrim(content.source_metadata->>'document_type'),''),
             'unknown'),'unknown') as document_class,
           rosetta_replay.truth_first_cluster_token(coalesce(
             nullif(btrim(content.source_metadata->>'provider_family'),''),
             nullif(btrim(content.source_metadata->>'source_provider'),''),
             nullif(btrim(content.source_metadata->>'provider'),''),
             case when content.source_provider_hash is not null
                  then 'provider_receipted' end,
             'unknown'),'unknown') as provider_family,
           rosetta_replay.truth_first_cluster_token(
             content.media_type,'unknown') as media_type
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
    join rosetta_v2513.source_document_content content
      on content.source_content_id = source.source_content_id
     and content.source_content_hash = source.source_content_hash
    join rosetta_v2513.source_document document
      on document.id = content.source_document_id
    where auth.snapshot_id = p_snapshot_id
      and auth.engine_version = c.engine_version
      and auth.rule_set_version = c.rule_set_version
      and auth.closure_prefix = c.closure_prefix
      and auth.closure_hash = v_closure_hash
      and auth.authorization_scope = 'full_candidate_generation'
  )
  select encode(extensions.digest(convert_to(
           jsonb_agg(jsonb_build_object(
             'ordinal',ordinal,
             'source_registry_id',source_registry_id,
             'source_content_id',source_content_id,
             'source_content_hash',source_content_hash,
             'byte_length',byte_length,
             'configuration_hash',configuration_hash,
             'closure_hash',closure_hash,
             'authorization_sha256',authorization_sha256,
             'document_class',document_class,
             'provider_family',provider_family,
             'media_type',media_type) order by ordinal)::text,
           'UTF8'),'sha256'),'hex')
    into v_frozen_membership_hash
  from authorized;

  v_receipt_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'campaign_id',c.campaign_id,
    'snapshot_id',s.snapshot_id,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'closure_prefix',c.closure_prefix,
    'closure_hash',v_closure_hash,
    'member_count',v_count,
    'total_bytes',v_bytes,
    'membership_sha256',v_membership_hash,
    'authorization_sha256',v_authorization_hash,
    'frozen_membership_sha256',v_frozen_membership_hash,
    'attempt_policy','single_observation_v1')::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.replay_campaign_membership_receipt (
    campaign_id,snapshot_id,engine_version,rule_set_version,
    closure_prefix,closure_hash,member_count,total_bytes,
    membership_sha256,authorization_sha256,frozen_membership_sha256,
    receipt_sha256)
  values (
    c.campaign_id,s.snapshot_id,c.engine_version,c.rule_set_version,
    c.closure_prefix,v_closure_hash,v_count,v_bytes,
    v_membership_hash,v_authorization_hash,v_frozen_membership_hash,
    v_receipt_hash);

  insert into rosetta_replay.replay_campaign_member (
    campaign_id,ordinal,source_registry_id,source_content_id,
    source_content_hash,byte_length,configuration_hash,closure_hash,
    authorization_sha256,document_class,provider_family,media_type)
  select c.campaign_id,
         row_number() over (
           order by source.source_content_hash,source.source_content_id,
                    source.source_registry_id)::integer,
         source.source_registry_id,source.source_content_id,
         source.source_content_hash,source.source_byte_length,
         rosetta_replay.expected_configuration_hash(source.source_registry_id),
         v_closure_hash,auth.authorization_sha256,
         rosetta_replay.truth_first_cluster_token(coalesce(
           nullif(btrim(document.document_type),''),
           nullif(btrim(content.source_metadata->>'document_class'),''),
           nullif(btrim(content.source_metadata->>'document_type'),''),
           'unknown'),'unknown'),
         rosetta_replay.truth_first_cluster_token(coalesce(
           nullif(btrim(content.source_metadata->>'provider_family'),''),
           nullif(btrim(content.source_metadata->>'source_provider'),''),
           nullif(btrim(content.source_metadata->>'provider'),''),
           case when content.source_provider_hash is not null
                then 'provider_receipted' end,
           'unknown'),'unknown'),
         rosetta_replay.truth_first_cluster_token(
           content.media_type,'unknown')
  from rosetta_replay.candidate_generation_authorization auth
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = auth.source_registry_id
  join rosetta_v2513.source_document_content content
    on content.source_content_id = source.source_content_id
   and content.source_content_hash = source.source_content_hash
  join rosetta_v2513.source_document document
    on document.id = content.source_document_id
  where auth.snapshot_id = p_snapshot_id
    and auth.engine_version = c.engine_version
    and auth.rule_set_version = c.rule_set_version
    and auth.closure_prefix = c.closure_prefix
    and auth.closure_hash = v_closure_hash
    and auth.authorization_scope = 'full_candidate_generation'
  order by source.source_content_hash,source.source_content_id,
           source.source_registry_id;

  if (select count(*) from rosetta_replay.replay_campaign_member
      where campaign_id = p_campaign_id) <> v_count then
    raise exception 'frozen member count differs from membership receipt'
      using errcode = 'P1Q04';
  end if;

  return jsonb_build_object(
    'campaign_id',c.campaign_id,
    'snapshot_id',s.snapshot_id,
    'member_count',v_count,
    'total_bytes',v_bytes,
    'membership_sha256',v_membership_hash,
    'frozen_membership_sha256',v_frozen_membership_hash,
    'receipt_sha256',v_receipt_hash,
    'attempt_policy','single_observation_v1');
end;
$function$;

create or replace function rosetta_replay.verify_replay_campaign_membership(
  p_campaign_id uuid)
returns boolean
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay','extensions'
as $function$
declare
  h rosetta_replay.replay_campaign_membership_receipt%rowtype;
  c rosetta_replay.replay_campaign%rowtype;
  v_count bigint;
  v_bytes bigint;
  v_hash text;
  v_frozen_hash text;
  v_receipt_hash text;
  v_bad bigint;
begin
  select * into c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if not found then
    return false;
  end if;
  select * into h
  from rosetta_replay.replay_campaign_membership_receipt
  where campaign_id = p_campaign_id;
  if not found then
    return false;
  end if;

  select count(*),coalesce(sum(member.byte_length),0),
         encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
           member.source_content_id::text,member.source_content_hash,
           member.byte_length::text),chr(10)
           order by member.source_content_hash,member.source_content_id),'') ,
           'UTF8'),'sha256'),'hex')
    into v_count,v_bytes,v_hash
  from rosetta_replay.replay_campaign_member member
  where member.campaign_id = p_campaign_id;

  select encode(extensions.digest(convert_to(
           jsonb_agg(jsonb_build_object(
             'ordinal',member.ordinal,
             'source_registry_id',member.source_registry_id,
             'source_content_id',member.source_content_id,
             'source_content_hash',member.source_content_hash,
             'byte_length',member.byte_length,
             'configuration_hash',member.configuration_hash,
             'closure_hash',member.closure_hash,
             'authorization_sha256',member.authorization_sha256,
             'document_class',member.document_class,
             'provider_family',member.provider_family,
             'media_type',member.media_type)
             order by member.ordinal)::text,'UTF8'),'sha256'),'hex')
    into v_frozen_hash
  from rosetta_replay.replay_campaign_member member
  where member.campaign_id = p_campaign_id;

  select count(*) into v_bad
  from rosetta_replay.replay_campaign_member member
  left join rosetta_replay.replay_source_registry source
    on source.source_registry_id = member.source_registry_id
   and source.source_content_id = member.source_content_id
   and source.source_content_hash = member.source_content_hash
   and source.source_byte_length = member.byte_length
  left join rosetta_replay.candidate_generation_authorization auth_check
    on auth_check.source_registry_id = member.source_registry_id
   and auth_check.snapshot_id = h.snapshot_id
   and auth_check.engine_version = h.engine_version
   and auth_check.rule_set_version = h.rule_set_version
   and auth_check.closure_prefix = h.closure_prefix
   and auth_check.closure_hash = h.closure_hash
   and auth_check.authorization_scope = 'full_candidate_generation'
   and auth_check.authorization_sha256 = member.authorization_sha256
  where member.campaign_id = p_campaign_id
    and (source.source_registry_id is null
      or auth_check.source_registry_id is null
      or member.closure_hash is distinct from h.closure_hash
      or member.authorization_sha256 is distinct from h.authorization_sha256
      or member.configuration_hash is distinct from
         rosetta_replay.expected_configuration_hash(
           member.source_registry_id));

  v_receipt_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'campaign_id',h.campaign_id,
    'snapshot_id',h.snapshot_id,
    'engine_version',h.engine_version,
    'rule_set_version',h.rule_set_version,
    'closure_prefix',h.closure_prefix,
    'closure_hash',h.closure_hash,
    'member_count',h.member_count,
    'total_bytes',h.total_bytes,
    'membership_sha256',h.membership_sha256,
    'authorization_sha256',h.authorization_sha256,
    'frozen_membership_sha256',h.frozen_membership_sha256,
    'attempt_policy','single_observation_v1')::text,'UTF8'),'sha256'),'hex');

  return c.attempt_policy = 'single_observation_v1'
     and c.max_retry_seq = 0
     and c.engine_version = h.engine_version
     and c.rule_set_version = h.rule_set_version
     and c.closure_prefix = h.closure_prefix
     and rosetta_replay.closure_sha256(c.closure_prefix) = h.closure_hash
     and v_count = h.member_count
     and v_bytes = h.total_bytes
     and v_hash = h.membership_sha256
     and v_frozen_hash = h.frozen_membership_sha256
     and v_receipt_hash = h.receipt_sha256
     and v_bad = 0;
end;
$function$;

-- Lock the first campaign outcome. In particular, failed_retryable is a
-- terminal quarantine for single-observation campaigns even though the legacy
-- attempt state machine historically allowed a second finalization.
create or replace function rosetta_replay.reject_dispositioned_attempt_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
begin
  if old.campaign_id is not null and exists (
    select 1
    from rosetta_replay.replay_campaign_source_disposition disposition
    where disposition.campaign_id = old.campaign_id
      and disposition.attempt_id = old.attempt_id
  ) then
    raise exception 'campaign attempt outcome is immutable after disposition'
      using errcode = 'raise_exception';
  end if;
  return new;
end;
$function$;

drop trigger if exists replay_attempt_disposition_lock
  on rosetta_replay.replay_attempt;
create trigger replay_attempt_disposition_lock
before update on rosetta_replay.replay_attempt
for each row execute function rosetta_replay.reject_dispositioned_attempt_mutation();

-- Preserve the non-campaign replay API for bounded/manual evidence. Only the
-- snapshot-required campaign starter below is allowed to schedule a sweep.
create or replace function rosetta_replay.claim_attempt(
  p_source_registry_id uuid,
  p_engine_version text,
  p_rule_set_version text,
  p_config_hash text,
  p_closure_hash text,
  p_worker_identity text default null,
  p_lease interval default interval '5 minutes')
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_attempt uuid;
  v_state text;
  v_worker text;
  v_lease timestamptz;
  v_retry integer;
  v_new uuid;
  v_identity text;
begin
  v_identity := p_source_registry_id::text || '|' || p_engine_version || '|'
    || p_rule_set_version || '|' || p_config_hash || '|' || p_closure_hash;

  -- Serialize legacy and sealed-manifest claimers on the exact same identity.
  -- Once any manifest has declared an identity to be a single observation,
  -- the compatibility API may neither adopt it nor manufacture retry_seq+1.
  perform pg_advisory_xact_lock(hashtextextended(v_identity,0));
  if exists (
    select 1
    from rosetta_replay.replay_attempt protected_attempt
    join rosetta_replay.replay_receipt protected_claim
      on protected_claim.attempt_id = protected_attempt.attempt_id
     and protected_claim.receipt_kind = 'claim'
     and protected_claim.receipt_payload->>'single_observation' = 'true'
    where protected_attempt.campaign_id is null
      and protected_attempt.attempt_identity = v_identity
  ) then
    raise exception
      'exact identity is reserved as a sealed-manifest single observation; legacy claim/retry is disabled'
      using errcode = 'P1Q46';
  end if;

  insert into rosetta_replay.replay_attempt (
    source_registry_id,engine_version,rule_set_version,
    config_hash,closure_hash,retry_seq,worker_identity,lease_expires_at)
  values (
    p_source_registry_id,p_engine_version,p_rule_set_version,
    p_config_hash,p_closure_hash,0,p_worker_identity,
    clock_timestamp() + p_lease)
  on conflict do nothing
  returning attempt_id,attempt_state into v_attempt,v_state;

  if v_attempt is not null then
    insert into rosetta_replay.replay_receipt (
      attempt_id,receipt_kind,worker_identity)
    values (v_attempt,'claim',p_worker_identity);
    return v_attempt;
  end if;

  select attempt.attempt_id,attempt.attempt_state,attempt.worker_identity,
         attempt.lease_expires_at,attempt.retry_seq
    into v_attempt,v_state,v_worker,v_lease,v_retry
  from rosetta_replay.replay_attempt attempt
  where attempt.campaign_id is null
    and attempt.attempt_identity = v_identity
  order by attempt.retry_seq desc
  limit 1
  for update;

  if v_state in ('claimed','running','failed_retryable','timed_out')
     and exists (
       select 1
       from rosetta_replay.sealed_corpus_member sealed_member
       where sealed_member.source_registry_id = p_source_registry_id
         and rosetta_replay.verify_sealed_manifest(
               sealed_member.manifest_id)
     ) then
    raise exception
      'source belongs to an intact sealed manifest; legacy adoption/retry is disabled for this exact identity'
      using errcode = 'P1Q46';
  end if;

  if v_state in ('claimed','running') then
    if v_worker is not null and p_worker_identity is not null
       and v_worker <> p_worker_identity
       and (v_lease is null or v_lease > clock_timestamp()) then
      raise exception 'attempt % is leased to worker % until %',
        v_attempt,v_worker,v_lease using errcode = '55P03';
    end if;
    update rosetta_replay.replay_attempt
    set worker_identity = coalesce(p_worker_identity,worker_identity),
        lease_expires_at = clock_timestamp() + p_lease
    where attempt_id = v_attempt;
    insert into rosetta_replay.replay_receipt (
      attempt_id,receipt_kind,worker_identity,receipt_payload)
    values (v_attempt,'claim',p_worker_identity,jsonb_build_object('adopted',true));
    return v_attempt;
  end if;

  if v_state in ('failed_retryable','timed_out') then
    insert into rosetta_replay.replay_attempt (
      source_registry_id,engine_version,rule_set_version,
      config_hash,closure_hash,retry_seq,worker_identity,lease_expires_at)
    values (
      p_source_registry_id,p_engine_version,p_rule_set_version,
      p_config_hash,p_closure_hash,v_retry + 1,p_worker_identity,
      clock_timestamp() + p_lease)
    returning attempt_id into v_new;
    insert into rosetta_replay.replay_receipt (
      attempt_id,receipt_kind,worker_identity,receipt_payload)
    values (
      v_new,'claim',p_worker_identity,
      jsonb_build_object('retry_of',v_attempt,'prior_state',v_state));
    return v_new;
  end if;
  return v_attempt;
end;
$function$;

-- A post-terminal manifest association appends a claim receipt. Preserve the
-- legacy suppression view's terminal-failure metadata by choosing the latest
-- terminal receipt, not simply the latest receipt of any kind.
create or replace view rosetta_replay.v_replay_suppressed_identities as
select a.source_registry_id,a.engine_version,a.rule_set_version,
       a.config_hash,a.closure_hash,a.attempt_state,
       r.failure_class,r.is_retryable
from rosetta_replay.replay_attempt a
join lateral (
  select rr.failure_class,rr.is_retryable
  from rosetta_replay.replay_receipt rr
  where rr.attempt_id = a.attempt_id
    and rr.receipt_kind in (
      'success','rejection','deferred','terminal_failure')
  order by rr.receipt_seq desc
  limit 1
) r on true
where a.attempt_state in (
  'succeeded','rejected','deferred_oversized','failed_terminal');

create or replace function rosetta_replay.replay_claim(
  p_source_registry_id uuid,
  p_closure_prefix text,
  p_engine_version text,
  p_rule_set_version text,
  p_config_hash text,
  p_closure_hash text,
  p_worker_identity text default null,
  p_lease interval default interval '5 minutes')
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $function$
declare
  v_attempt uuid;
  v_state text;
  v_expected_config text;
  v_actual_closure text;
begin
  if not rosetta_replay.replay_campaign_source_eligible(
       p_source_registry_id,p_closure_prefix) then
    raise exception 'source % is outside immutable replay authorization for %',
      p_source_registry_id,p_closure_prefix using errcode = 'P1R12';
  end if;
  v_expected_config :=
    rosetta_replay.expected_configuration_hash(p_source_registry_id);
  if p_config_hash is distinct from v_expected_config then
    raise exception 'configuration hash mismatch: supplied %, expected %',
      p_config_hash,v_expected_config using errcode = 'P1R13';
  end if;
  v_actual_closure := rosetta_replay.closure_sha256(p_closure_prefix);
  if p_closure_hash is distinct from v_actual_closure then
    raise exception 'closure hash mismatch: supplied %, computed %',
      p_closure_hash,v_actual_closure using errcode = 'P1R14';
  end if;
  if not exists (
    select 1 from rosetta_v2513.extraction_rule_manifest manifest
    where manifest.engine_version = p_engine_version
      and manifest.rule_set_version = p_rule_set_version
      and manifest.is_active) then
    raise exception 'candidate engine/rule manifest is not installed and active'
      using errcode = 'P1R15';
  end if;
  v_attempt := rosetta_replay.claim_attempt(
    p_source_registry_id,p_engine_version,p_rule_set_version,
    p_config_hash,p_closure_hash,p_worker_identity,p_lease);
  select attempt_state into strict v_state
  from rosetta_replay.replay_attempt
  where attempt_id = v_attempt;
  if v_state in (
    'succeeded','rejected','deferred_oversized','timed_out','failed_terminal') then
    return v_attempt;
  end if;
  insert into rosetta_replay.replay_receipt (
    attempt_id,receipt_kind,worker_identity)
  values (v_attempt,'start',p_worker_identity);
  update rosetta_replay.replay_attempt
  set attempt_state = 'running',
      started_at = coalesce(started_at,clock_timestamp())
  where attempt_id = v_attempt;
  return v_attempt;
end;
$function$;

create or replace function rosetta_replay.replay_campaign_claim_source(
  p_campaign_id uuid,
  p_source_registry_id uuid)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  member rosetta_replay.replay_campaign_member%rowtype;
  v_attempt uuid;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;
  if c.campaign_state <> 'running'
     or c.attempt_policy <> 'single_observation_v1' then
    raise exception 'campaign % is not a running single-observation campaign',p_campaign_id
      using errcode = 'P1Q06';
  end if;

  select * into strict member
  from rosetta_replay.replay_campaign_member
  where campaign_id = p_campaign_id
    and source_registry_id = p_source_registry_id;

  if exists (
    select 1
    from rosetta_replay.replay_campaign_source_disposition disposition
    where disposition.campaign_id = p_campaign_id
      and disposition.source_registry_id = p_source_registry_id) then
    raise exception 'source % already has an immutable campaign disposition',
      p_source_registry_id using errcode = 'P1Q28';
  end if;

  insert into rosetta_replay.replay_attempt (
    campaign_id,source_registry_id,engine_version,rule_set_version,
    config_hash,closure_hash,retry_seq,attempt_state,worker_identity,
    lease_expires_at,started_at)
  values (
    c.campaign_id,member.source_registry_id,c.engine_version,c.rule_set_version,
    member.configuration_hash,member.closure_hash,0,'running',c.worker_identity,
    clock_timestamp()
      + (greatest(c.timeout_ms,1)::text || ' milliseconds')::interval
      + interval '1 minute',
    clock_timestamp())
  on conflict (campaign_id,source_registry_id)
    where campaign_id is not null
  do nothing
  returning attempt_id into v_attempt;

  if v_attempt is null then
    select attempt_id into strict v_attempt
    from rosetta_replay.replay_attempt
    where campaign_id = p_campaign_id
      and source_registry_id = p_source_registry_id;
    return v_attempt;
  end if;

  insert into rosetta_replay.replay_receipt (
    attempt_id,receipt_kind,worker_identity,receipt_payload)
  values
    (v_attempt,'claim',c.worker_identity,
      jsonb_build_object('campaign_id',c.campaign_id,'retry_seq',0)),
    (v_attempt,'start',c.worker_identity,
      jsonb_build_object('campaign_id',c.campaign_id,'single_observation',true));
  return v_attempt;
end;
$function$;

create or replace function rosetta_replay.truth_first_quarantine_thresholds(
  p_source_total bigint,
  p_quarantined bigint)
returns jsonb
language plpgsql immutable strict
set search_path to 'pg_catalog'
as $function$
declare
  v_basis_points integer;
begin
  if p_source_total <= 0
     or p_quarantined < 0
     or p_quarantined > p_source_total then
    raise exception 'invalid quarantine fraction: % / %',
      p_quarantined,p_source_total using errcode = '22023';
  end if;
  v_basis_points := floor(
    p_quarantined::numeric * 10000 / p_source_total::numeric)::integer;
  return jsonb_build_object(
    'source_total',p_source_total,
    'quarantined_sources',p_quarantined,
    'quarantine_basis_points',v_basis_points,
    'quarantine_percent',round(
      p_quarantined::numeric * 100 / p_source_total::numeric,2),
    'warning_threshold_basis_points',1000,
    'review_threshold_basis_points',1500,
    'warning_reached',
      p_quarantined * 10000 >= p_source_total * 1000,
    'review_required',
      p_quarantined * 10000 >= p_source_total * 1500,
    'processing_continues',true);
end;
$function$;

create or replace function rosetta_replay.truth_first_quarantine_patterns(
  p_campaign_id uuid)
returns table (
  disposition text,
  failure_class text,
  failure_code text,
  document_class text,
  provider_family text,
  media_type text,
  source_count bigint,
  corpus_basis_points integer)
language sql stable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
  with grouped as (
    select disposition.disposition,
           rosetta_replay.truth_first_cluster_token(
             coalesce(receipt.failure_class,
               case disposition.disposition
                 when 'rejected' then 'deterministic_validation'
                 when 'deferred_oversized' then 'deferred'
                 when 'timed_out' then 'timeout'
                 when 'retry_exhausted' then 'retryable_infrastructure'
                 when 'failed_terminal' then 'terminal_infrastructure'
                 else 'unknown'
               end),'unknown') as failure_class,
           rosetta_replay.truth_first_failure_code_bucket(
             disposition.failure_code) as failure_code,
           member.document_class,
           member.provider_family,
           member.media_type,
           count(*)::bigint as source_count,
           header.member_count
    from rosetta_replay.replay_campaign_source_disposition disposition
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = disposition.campaign_id
     and member.source_registry_id = disposition.source_registry_id
    join rosetta_replay.replay_campaign_membership_receipt header
      on header.campaign_id = member.campaign_id
    left join rosetta_replay.replay_receipt receipt
      on receipt.receipt_id = disposition.receipt_id
    where disposition.campaign_id = p_campaign_id
      and disposition.disposition <> 'completed'
    group by disposition.disposition,
             rosetta_replay.truth_first_cluster_token(
               coalesce(receipt.failure_class,
                 case disposition.disposition
                   when 'rejected' then 'deterministic_validation'
                   when 'deferred_oversized' then 'deferred'
                   when 'timed_out' then 'timeout'
                   when 'retry_exhausted' then 'retryable_infrastructure'
                   when 'failed_terminal' then 'terminal_infrastructure'
                   else 'unknown'
                 end),'unknown'),
             rosetta_replay.truth_first_failure_code_bucket(
               disposition.failure_code),
             member.document_class,member.provider_family,member.media_type,
             header.member_count
  )
  select grouped.disposition,grouped.failure_class,grouped.failure_code,
         grouped.document_class,grouped.provider_family,grouped.media_type,
         grouped.source_count,
         floor(grouped.source_count::numeric * 10000
           / grouped.member_count::numeric)::integer as corpus_basis_points
  from grouped
  order by grouped.source_count desc,grouped.failure_class,
           grouped.failure_code,grouped.document_class,
           grouped.provider_family,grouped.media_type;
$function$;

create or replace function rosetta_replay.truth_first_campaign_progress(
  p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  h rosetta_replay.replay_campaign_membership_receipt%rowtype;
  v_accounted bigint;
  v_completed bigint;
  v_rejected bigint;
  v_deferred bigint;
  v_timed_out bigint;
  v_retry_exhausted bigint;
  v_failed_terminal bigint;
  v_attempted bigint;
  v_running bigint;
  v_pending bigint;
  v_staged_overdue bigint;
  v_claimable bigint;
  v_bound bigint;
  v_terminal_orphans bigint;
  v_non_success bigint;
  v_thresholds jsonb;
  v_complete boolean;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  select * into strict h
  from rosetta_replay.replay_campaign_membership_receipt
  where campaign_id = p_campaign_id;
  if c.attempt_policy <> 'single_observation_v1' then
    raise exception 'campaign % is not truth-first',p_campaign_id
      using errcode = 'P1Q34';
  end if;

  select count(*),
         count(*) filter (where disposition = 'completed'),
         count(*) filter (where disposition = 'rejected'),
         count(*) filter (where disposition = 'deferred_oversized'),
         count(*) filter (where disposition = 'timed_out'),
         count(*) filter (where disposition = 'retry_exhausted'),
         count(*) filter (where disposition = 'failed_terminal')
    into v_accounted,v_completed,v_rejected,v_deferred,v_timed_out,
         v_retry_exhausted,v_failed_terminal
  from rosetta_replay.replay_campaign_source_disposition disposition
  where disposition.campaign_id = p_campaign_id;

  select count(*),
         count(*) filter (
           where attempt.attempt_state in ('claimed','running')
             and disposition.disposition_id is null),
         count(*) filter (
           where attempt.attempt_state = 'running'
             and attempt.pending_outcome is not null
             and disposition.disposition_id is null),
         count(*) filter (
           where attempt.attempt_state = 'running'
             and attempt.pending_outcome is not null
             and attempt.lease_expires_at <= clock_timestamp()
             and disposition.disposition_id is null),
         count(*) filter (
           where attempt.attempt_state in (
             'succeeded','rejected','deferred_oversized','timed_out',
             'failed_retryable','failed_terminal')
             and disposition.disposition_id is null)
    into v_attempted,v_running,v_pending,v_staged_overdue,v_terminal_orphans
  from rosetta_replay.replay_attempt attempt
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = attempt.campaign_id
   and member.source_registry_id = attempt.source_registry_id
  left join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = attempt.campaign_id
   and disposition.source_registry_id = attempt.source_registry_id
  where attempt.campaign_id = p_campaign_id
    and attempt.retry_seq = 0;

  select count(*) into v_claimable
  from rosetta_replay.replay_campaign_member member
  where member.campaign_id = p_campaign_id
    and not exists (
      select 1 from rosetta_replay.replay_attempt attempt
      where attempt.campaign_id = member.campaign_id
        and attempt.source_registry_id = member.source_registry_id)
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = member.campaign_id
        and disposition.source_registry_id = member.source_registry_id);

  select count(*) into v_bound
  from rosetta_replay.replay_run_binding binding
  join rosetta_replay.replay_attempt attempt
    on attempt.attempt_id = binding.attempt_id
   and attempt.campaign_id = p_campaign_id
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = attempt.campaign_id
   and member.source_registry_id = binding.source_registry_id;

  v_non_success := v_rejected + v_deferred + v_timed_out
    + v_retry_exhausted + v_failed_terminal;
  v_thresholds := rosetta_replay.truth_first_quarantine_thresholds(
    h.member_count,v_non_success);
  v_complete := v_accounted = h.member_count;

  return jsonb_build_object(
    'campaign_id',c.campaign_id,
    'campaign_name',c.campaign_name,
    'campaign_state',c.campaign_state,
    'replay_result',c.replay_result,
    'processing_complete',v_complete,
    'processing_state',case
      when c.campaign_state = 'blocked' then 'blocked'
      when c.campaign_state = 'stopped' then 'stopped'
      when c.campaign_state = 'prepared' then 'not_started'
      when v_complete then 'complete'
      else 'in_progress' end,
    'source_result',case
      when v_complete and v_non_success = 0 then 'all_completed'
      when v_complete then 'completed_with_quarantine'
      when c.campaign_state in ('blocked','stopped') then 'incomplete'
      when c.campaign_state = 'prepared' then 'not_started'
      else 'in_progress' end,
    'promotion_state','not_evaluated',
    'promotion_eligible',false,
    'attempt_policy',c.attempt_policy,
    'snapshot_id',h.snapshot_id,
    'source_total',h.member_count,
    'frozen_denominator',h.member_count,
    'accounted_sources',v_accounted,
    'unprocessed_sources',h.member_count - v_accounted,
    'passed_sources',v_completed,
    'completed_sources',v_completed,
    'quarantined_sources',v_non_success,
    'nonpass_sources',v_non_success,
    'rejected_sources',v_rejected,
    'deferred_sources',v_deferred,
    'timed_out_sources',v_timed_out,
    'retry_exhausted_sources',v_retry_exhausted,
    'failed_terminal_sources',v_failed_terminal,
    'attempted_sources',v_attempted,
    'bound_sources',v_bound,
    'remaining_sources',h.member_count - v_accounted,
    'running_attempts',v_running,
    'pending_finalize',v_pending,
    'staged_finalize_overdue',v_staged_overdue,
    'claimable_sources',v_claimable,
    'terminal_orphans',v_terminal_orphans,
    'quarantine_thresholds',v_thresholds,
    'review_scope','generalized_patterns_across_entire_quarantine_stack',
    'closure_prefix',h.closure_prefix,
    'closure_hash',h.closure_hash,
    'engine_version',h.engine_version,
    'rule_set_version',h.rule_set_version,
    'membership_sha256',h.membership_sha256,
    'frozen_membership_sha256',h.frozen_membership_sha256,
    'executor_count',c.executor_count,
    'timeout_ms',c.timeout_ms,
    'cron_job_ids',to_jsonb(c.cron_job_ids),
    'last_error_code',c.last_error_code,
    'last_error_detail',c.last_error_detail,
    'started_at',c.started_at,
    'finished_at',c.finished_at);
end;
$function$;

create or replace function rosetta_replay.emit_truth_first_checkpoints(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  h rosetta_replay.replay_campaign_membership_receipt%rowtype;
  v_quarantined bigint;
  v_thresholds jsonb;
  v_patterns jsonb;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.attempt_policy <> 'single_observation_v1' then
    return jsonb_build_object('truth_first',false);
  end if;
  select * into strict h
  from rosetta_replay.replay_campaign_membership_receipt
  where campaign_id = p_campaign_id;
  select count(*) into v_quarantined
  from rosetta_replay.replay_campaign_source_disposition disposition
  where disposition.campaign_id = p_campaign_id
    and disposition.disposition <> 'completed';
  v_thresholds := rosetta_replay.truth_first_quarantine_thresholds(
    h.member_count,v_quarantined);

  if (v_thresholds->>'warning_reached')::boolean
     and not exists (
       select 1 from rosetta_replay.replay_campaign_event event
       where event.campaign_id = p_campaign_id
         and event.event_kind = 'warning_10pct') then
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,event_payload)
    values (
      p_campaign_id,'warning_10pct',
      v_thresholds || jsonb_build_object(
        'checkpoint','early_warning',
        'denominator_is_frozen',true,
        'processing_continues',true))
    on conflict do nothing;
  end if;

  if (v_thresholds->>'review_required')::boolean
     and not exists (
       select 1 from rosetta_replay.replay_campaign_event event
       where event.campaign_id = p_campaign_id
         and event.event_kind = 'cluster_review_required_15pct') then
    select coalesce(jsonb_agg(to_jsonb(pattern)
             order by pattern.source_count desc,pattern.failure_class,
                      pattern.failure_code,pattern.document_class),
           '[]'::jsonb)
      into v_patterns
    from (
      select *
      from rosetta_replay.truth_first_quarantine_patterns(p_campaign_id)
      order by source_count desc,failure_class,failure_code,document_class
    ) pattern;
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,event_payload)
    values (
      p_campaign_id,'cluster_review_required_15pct',
      v_thresholds || jsonb_build_object(
        'checkpoint','generalized_pattern_review_required',
        'review_scope','entire_quarantine_stack',
        'generalized_patterns',v_patterns,
        'source_specific_parser_changes_authorized',false,
        'denominator_is_frozen',true,
        'processing_continues',true))
    on conflict do nothing;
  end if;

  return v_thresholds || jsonb_build_object(
    'warning_event_recorded',exists(
      select 1 from rosetta_replay.replay_campaign_event event
      where event.campaign_id = p_campaign_id
        and event.event_kind = 'warning_10pct'),
    'review_event_recorded',exists(
      select 1 from rosetta_replay.replay_campaign_event event
      where event.campaign_id = p_campaign_id
        and event.event_kind = 'cluster_review_required_15pct'));
end;
$function$;

create or replace function rosetta_replay.truth_first_campaign_supervise(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  progress jsonb;
  v_result text;
  v_unscheduled integer := 0;
  v_changed integer := 0;
  v_membership_valid boolean := false;
  v_sqlstate text;
  v_error text;
  v_overdue_attempt uuid;
  v_overdue_source uuid;
  v_overdue_outcome text;
  v_overdue_sqlstate text;
  v_overdue_error text;
  v_overdue_payload jsonb;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.attempt_policy <> 'single_observation_v1' then
    raise exception 'campaign % is not truth-first',p_campaign_id
      using errcode = 'P1Q34';
  end if;

  if c.campaign_state = 'running' then
    begin
      if not rosetta_replay.truth_first_campaign_header_valid(p_campaign_id) then
        raise exception 'frozen campaign header verification failed'
          using errcode = 'P1Q35';
      end if;
      perform rosetta_replay.truth_first_campaign_reap_expired(p_campaign_id);
      perform rosetta_replay.truth_first_campaign_sync_dispositions(p_campaign_id);
      begin
        perform rosetta_replay.emit_truth_first_checkpoints(p_campaign_id);
      exception
        when query_canceled then
          perform set_config('statement_timeout','0',true);
          raise warning 'truth-first checkpoint emission canceled; processing continues';
        when others then
          raise warning 'truth-first checkpoint emission failed; processing continues: %',
            sqlerrm;
      end;
    exception
      when query_canceled then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_error = message_text;
        perform set_config('statement_timeout','0',true);
        perform rosetta_replay.block_truth_first_campaign_integrity(
          p_campaign_id,v_sqlstate,v_error);
      when others then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_error = message_text;
        perform rosetta_replay.block_truth_first_campaign_integrity(
          p_campaign_id,v_sqlstate,v_error);
    end;
  end if;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  progress := rosetta_replay.truth_first_campaign_progress(p_campaign_id);

  -- A committed staged result is evidence waiting to be finalized, not a
  -- reason to stop later sources. If a finalizer owns the row, SKIP LOCKED
  -- leaves it alone. Otherwise an expired finalization lease becomes one
  -- source-local quarantine while preserving the staged observation; the
  -- parser is never invoked again.
  if c.campaign_state = 'running'
     and (progress->>'staged_finalize_overdue')::bigint > 0 then
    select attempt.attempt_id,attempt.source_registry_id,
           attempt.pending_outcome,attempt.pending_sqlstate,
           attempt.pending_error_detail,attempt.pending_payload
      into v_overdue_attempt,v_overdue_source,v_overdue_outcome,
           v_overdue_sqlstate,v_overdue_error,v_overdue_payload
    from rosetta_replay.replay_attempt attempt
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = attempt.campaign_id
     and member.source_registry_id = attempt.source_registry_id
    where attempt.campaign_id = p_campaign_id
      and attempt.retry_seq = 0
      and attempt.attempt_state = 'running'
      and attempt.pending_outcome is not null
      and attempt.lease_expires_at <= clock_timestamp()
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.attempt_id = attempt.attempt_id)
    order by member.ordinal
    limit 1
    for update of attempt skip locked;

    if v_overdue_attempt is not null then
      begin
        perform rosetta_replay.quarantine_finalize_failure(
          p_campaign_id,v_overdue_source,v_overdue_attempt,c.worker_identity,
          'P1Q43',
          'staged outcome finalization lease expired; parser was not rerun',
          v_overdue_outcome,v_overdue_sqlstate,v_overdue_error,
          v_overdue_payload);
      exception
        when query_canceled then
          perform set_config('statement_timeout','0',true);
          raise warning 'truth-first overdue quarantine canceled; processing continues';
        when others then
          get stacked diagnostics
            v_sqlstate = returned_sqlstate,
            v_error = message_text;
          perform rosetta_replay.block_truth_first_campaign_integrity(
            p_campaign_id,v_sqlstate,
            'overdue staged evidence could not be sealed: '
              || coalesce(v_error,'unknown finalization error'),
            v_overdue_attempt);
      end;
    end if;
    select * into strict c
    from rosetta_replay.replay_campaign
    where campaign_id = p_campaign_id;
    progress := rosetta_replay.truth_first_campaign_progress(p_campaign_id);
  end if;

  if c.campaign_state = 'running'
     and (progress->>'terminal_orphans')::bigint > 0 then
    perform rosetta_replay.block_truth_first_campaign_integrity(
      p_campaign_id,'P1Q36',
      'terminal attempts exist without immutable dispositions');
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  elsif c.campaign_state = 'running'
        and (progress->>'remaining_sources')::bigint = 0
        and (progress->>'running_attempts')::bigint = 0 then
    begin
      if not rosetta_replay.verify_replay_campaign_membership(p_campaign_id) then
        raise exception 'full frozen membership verification returned false'
          using errcode = 'P1Q35';
      end if;
      v_membership_valid := true;
    exception
      when query_canceled then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_error = message_text;
        perform set_config('statement_timeout','0',true);
        perform rosetta_replay.block_truth_first_campaign_integrity(
          p_campaign_id,v_sqlstate,
          'completion membership verification was canceled: '
            || coalesce(v_error,'query canceled'));
        v_unscheduled :=
          rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
      when others then
        get stacked diagnostics
          v_sqlstate = returned_sqlstate,
          v_error = message_text;
        perform rosetta_replay.block_truth_first_campaign_integrity(
          p_campaign_id,v_sqlstate,
          'completion membership verification failed: '
            || coalesce(v_error,'unknown verification error'));
        v_unscheduled :=
          rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
    end;
    if v_membership_valid then
      v_result := case
        when (progress->>'quarantined_sources')::bigint = 0 then 'pass'
        else 'nonpass'
      end;
      update rosetta_replay.replay_campaign
      set campaign_state = 'completed',
          replay_result = v_result,
          finished_at = clock_timestamp(),
          last_error_code = null,
          last_error_detail = null
      where campaign_id = p_campaign_id
        and campaign_state = 'running';
      get diagnostics v_changed = row_count;
      if v_changed = 1 then
        insert into rosetta_replay.replay_campaign_event (
          campaign_id,event_kind,event_payload)
        values (
          p_campaign_id,'completed',
          progress || jsonb_build_object(
            'campaign_state','completed',
            'replay_result',v_result,
            'processing_complete',true,
            'processing_state','complete',
            'source_result',case when v_result = 'pass'
              then 'all_completed' else 'completed_with_quarantine' end,
            'promotion_state','not_evaluated',
            'promotion_eligible',false));
        v_unscheduled :=
          rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
      end if;
    end if;
  elsif c.campaign_state = 'running'
        and (progress->>'running_attempts')::bigint = 0
        and (progress->>'claimable_sources')::bigint = 0
        and (progress->>'remaining_sources')::bigint > 0 then
    perform rosetta_replay.block_truth_first_campaign_integrity(
      p_campaign_id,'P1Q37',
      'frozen members remain without a claimable attempt or disposition');
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  elsif c.campaign_state in ('blocked','completed','stopped') then
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  end if;

  return rosetta_replay.truth_first_campaign_progress(p_campaign_id)
    || jsonb_build_object('jobs_unscheduled',v_unscheduled);
end;
$function$;

create or replace function rosetta_replay.start_truth_first_replay_campaign(
  p_campaign_name text,
  p_snapshot_id uuid,
  p_closure_prefix text,
  p_engine_version text,
  p_rule_set_version text,
  p_worker_identity text,
  p_executor_count integer default 4,
  p_timeout_ms integer default 120000,
  p_queue_depth integer default 4)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $function$
declare
  v_id uuid;
  v_jobs bigint[] := '{}'::bigint[];
  v_job bigint;
  v_name text;
  v_command text;
  v_closure_hash text;
  v_freeze jsonb;
  v_outer_timeout integer;
  v_finalize_timeout integer;
  i integer;
begin
  if to_regnamespace('cron') is null
     or not exists (
       select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is unavailable; campaign was not started'
      using errcode = 'P1C01';
  end if;
  if p_closure_prefix <> 'v2528_'
     or to_regprocedure(
       'rosetta_replay.v2528_reference_date_from_metadata(jsonb)') is null
     or to_regprocedure(
       'rosetta_v2513.v2528_run_rosetta_v3_extraction_v2511_candidate(integer,text,text,text,text,text,text,text,date,text,jsonb)') is null then
    raise exception 'truth-first migration 07 supports only installed v2528_'
      using errcode = 'P1Q31';
  end if;
  if nullif(btrim(p_campaign_name),'') is null
     or nullif(btrim(p_worker_identity),'') is null
     or p_executor_count < 1 or p_executor_count > 4
     or p_timeout_ms <> 120000
     or p_queue_depth <> p_executor_count then
    raise exception 'invalid truth-first campaign settings'
      using errcode = '22023';
  end if;
  v_closure_hash := rosetta_replay.closure_sha256(p_closure_prefix);
  if not exists (
    select 1 from rosetta_v2513.extraction_rule_manifest manifest
    where manifest.engine_version = p_engine_version
      and manifest.rule_set_version = p_rule_set_version
      and manifest.is_active) then
    raise exception 'campaign engine/rule manifest is not installed and active'
      using errcode = 'P1R15';
  end if;

  insert into rosetta_replay.replay_campaign (
    campaign_name,closure_prefix,engine_version,rule_set_version,
    worker_identity,timeout_ms,max_retry_seq,executor_count,queue_depth,
    campaign_state,replay_result,attempt_policy)
  values (
    btrim(p_campaign_name),p_closure_prefix,p_engine_version,p_rule_set_version,
    btrim(p_worker_identity),p_timeout_ms,0,p_executor_count,p_queue_depth,
    'prepared','pending','single_observation_v1')
  returning campaign_id into v_id;

  v_freeze := rosetta_replay.freeze_replay_campaign_membership(
    v_id,p_snapshot_id);
  if not rosetta_replay.verify_replay_campaign_membership(v_id) then
    raise exception 'new campaign membership failed full verification'
      using errcode = 'P1Q35';
  end if;
  update rosetta_replay.replay_campaign
  set campaign_state = 'running',
      started_at = clock_timestamp()
  where campaign_id = v_id;

  v_name := 'rosetta-v2528-' || v_id::text || '-truth-claim';
  v_command := format(
    'select rosetta_replay.truth_first_campaign_claim_refill(%L::uuid)',
    v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'5 seconds',v_command;
  v_jobs := array_append(v_jobs,v_job);

  v_outer_timeout := p_timeout_ms;
  -- Finalization is evidence I/O only. Keep its hard limit below the staged
  -- one-minute grace so an active finalizer cannot be mistaken for abandoned
  -- evidence by the supervisor.
  v_finalize_timeout := 30000;
  for i in 1..p_executor_count loop
    v_name := 'rosetta-v2528-' || v_id::text || '-truth-execute-' || i::text;
    v_command := format(
      'set lock_timeout = %L; set statement_timeout = %L; '
      'select rosetta_replay.truth_first_campaign_execute_next(%L::uuid)',
      '10s',v_outer_timeout::text || 'ms',v_id::text);
    execute 'select cron.schedule($1,$2,$3)'
      into v_job using v_name,'5 seconds',v_command;
    v_jobs := array_append(v_jobs,v_job);
  end loop;

  v_name := 'rosetta-v2528-' || v_id::text || '-truth-finalize';
  v_command := format(
    'set statement_timeout = %L; '
    'select rosetta_replay.truth_first_campaign_finalize_next(%L::uuid)',
    v_finalize_timeout::text || 'ms',v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'2 seconds',v_command;
  v_jobs := array_append(v_jobs,v_job);

  v_name := 'rosetta-v2528-' || v_id::text || '-truth-supervise';
  v_command := format(
    'select rosetta_replay.truth_first_campaign_supervise(%L::uuid)',
    v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'10 seconds',v_command;
  v_jobs := array_append(v_jobs,v_job);

  update rosetta_replay.replay_campaign
  set cron_job_ids = v_jobs
  where campaign_id = v_id;
  insert into rosetta_replay.replay_campaign_event (
    campaign_id,event_kind,event_payload)
  values (
    v_id,'started',v_freeze || jsonb_build_object(
      'cron_job_ids',v_jobs,
      'closure_hash',v_closure_hash,
      'execution_statement_timeout_ms',v_outer_timeout,
      'finalization_statement_timeout_ms',v_finalize_timeout,
      'queue_depth_equals_executor_count',true,
      'automatic_retry_rows_per_campaign_source',0,
      'hard_backend_crash_before_committed_outcome','invocation_ambiguous',
      'quarantine_warning_basis_points',1000,
      'quarantine_review_basis_points',1500,
      'thresholds_stop_processing',false,
      'promotion_state','not_evaluated'));
  perform rosetta_replay.truth_first_campaign_claim_refill(v_id);
  return v_id;
end;
$function$;

-- The old starter cannot freeze a snapshot or isolate attempts by campaign.
-- Keep the exact signature so stale callers fail before any jobs are created.
create or replace function rosetta_replay.start_replay_campaign(
  p_campaign_name text,
  p_closure_prefix text,
  p_engine_version text,
  p_rule_set_version text,
  p_worker_identity text,
  p_executor_count integer default 4,
  p_timeout_ms integer default 120000,
  p_max_retry_seq integer default 3,
  p_queue_depth integer default 16)
returns uuid
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'legacy campaign start is disabled; use start_truth_first_replay_campaign with a frozen snapshot'
    using errcode = 'P1Q38';
end;
$function$;

-- Keep historical campaigns operable, but make the boundary between their
-- retry-oriented state machine and truth-first campaigns structural. Stale
-- callers are routed to the campaign-scoped implementation; compatibility
-- and promotion gates are rejected until a dedicated frozen-member gate is
-- installed. This prevents live-registry totals or legacy retry semantics
-- from being mistaken for frozen-corpus truth.
alter function rosetta_replay.record_campaign_source_disposition(
  uuid,uuid,uuid,text)
  rename to record_campaign_source_disposition_legacy_v6;
create function rosetta_replay.record_campaign_source_disposition(
  p_campaign_id uuid,
  p_source_registry_id uuid,
  p_attempt_id uuid,
  p_disposition text)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.record_truth_first_disposition(
      p_campaign_id,p_source_registry_id,p_attempt_id,p_disposition);
  end if;
  return rosetta_replay.record_campaign_source_disposition_legacy_v6(
    p_campaign_id,p_source_registry_id,p_attempt_id,p_disposition);
end;
$function$;

alter function rosetta_replay.replay_campaign_reap_expired(uuid,integer)
  rename to replay_campaign_reap_expired_legacy_v6;
create function rosetta_replay.replay_campaign_reap_expired(
  p_campaign_id uuid,
  p_limit integer default 128)
returns integer
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_reap_expired(
      p_campaign_id,p_limit);
  end if;
  return rosetta_replay.replay_campaign_reap_expired_legacy_v6(
    p_campaign_id,p_limit);
end;
$function$;

alter function rosetta_replay.replay_campaign_sync_dispositions(uuid)
  rename to replay_campaign_sync_dispositions_legacy_v6;
create function rosetta_replay.replay_campaign_sync_dispositions(
  p_campaign_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_sync_dispositions(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_sync_dispositions_legacy_v6(
    p_campaign_id);
end;
$function$;

alter function rosetta_replay.replay_campaign_claim_refill(uuid)
  rename to replay_campaign_claim_refill_legacy_v6;
create function rosetta_replay.replay_campaign_claim_refill(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_claim_refill(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_claim_refill_legacy_v6(p_campaign_id);
end;
$function$;

alter function rosetta_replay.replay_campaign_progress(uuid)
  rename to replay_campaign_progress_legacy_v6;
create function rosetta_replay.replay_campaign_progress(
  p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_progress(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_progress_legacy_v6(p_campaign_id);
end;
$function$;

alter function rosetta_replay.replay_campaign_finalize_next(uuid)
  rename to replay_campaign_finalize_next_legacy_v6;
create function rosetta_replay.replay_campaign_finalize_next(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_finalize_next(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_finalize_next_legacy_v6(p_campaign_id);
end;
$function$;

alter function rosetta_replay.replay_campaign_supervise(uuid)
  rename to replay_campaign_supervise_legacy_v6;
create function rosetta_replay.replay_campaign_supervise(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    return rosetta_replay.truth_first_campaign_supervise(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_supervise_legacy_v6(p_campaign_id);
end;
$function$;

alter function rosetta_replay.replay_campaign_truth_gate(uuid)
  rename to replay_campaign_truth_gate_legacy_v6;
create function rosetta_replay.replay_campaign_truth_gate(
  p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare v_policy text;
begin
  select attempt_policy into strict v_policy
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if v_policy = 'single_observation_v1' then
    raise exception 'truth-first processing truth is not a compatibility or promotion decision'
      using errcode = 'P1Q40';
  end if;
  return rosetta_replay.replay_campaign_truth_gate_legacy_v6(p_campaign_id);
end;
$function$;

revoke all on table
  rosetta_replay.replay_campaign_membership_receipt,
  rosetta_replay.replay_campaign_member
  from public;

revoke all on function
  rosetta_replay.reject_campaign_membership_mutation(),
  rosetta_replay.lock_frozen_campaign_identity(),
  rosetta_replay.require_truth_first_campaign_insert(),
  rosetta_replay.truth_first_campaign_header_valid(uuid),
  rosetta_replay.truth_first_cluster_token(text,text),
  rosetta_replay.truth_first_failure_code_bucket(text),
  rosetta_replay.block_truth_first_campaign_integrity(uuid,text,text,uuid),
  rosetta_replay.record_truth_first_disposition(uuid,uuid,uuid,text),
  rosetta_replay.enforce_truth_first_disposition_insert(),
  rosetta_replay.claim_attempt(uuid,text,text,text,text,text,interval),
  rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval),
  rosetta_replay.freeze_replay_campaign_membership(uuid,uuid),
  rosetta_replay.verify_replay_campaign_membership(uuid),
  rosetta_replay.reject_dispositioned_attempt_mutation(),
  rosetta_replay.guard_campaign_member_insert(),
  rosetta_replay.truth_first_campaign_reap_expired(uuid,integer),
  rosetta_replay.truth_first_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_source(uuid,uuid),
  rosetta_replay.truth_first_campaign_claim_refill(uuid),
  rosetta_replay.truth_first_replay_execute(uuid,text,integer),
  rosetta_replay.truth_observation_configuration_hash(uuid),
  rosetta_replay.truth_observation_claim(
    uuid,uuid,text,text,text,text,text,text,interval),
  rosetta_replay.truth_observation_execute(uuid,uuid,text,integer),
  rosetta_replay.truth_observation_finalize(uuid,uuid,text),
  rosetta_replay.truth_first_campaign_execute_next(uuid),
  rosetta_replay.quarantine_finalize_failure(
    uuid,uuid,uuid,text,text,text,text,text,text,jsonb),
  rosetta_replay.handle_truth_first_finalize_error(
    uuid,uuid,uuid,text,text,text,text,text,text,jsonb),
  rosetta_replay.truth_first_campaign_finalize_next(uuid),
  rosetta_replay.truth_first_quarantine_thresholds(bigint,bigint),
  rosetta_replay.truth_first_quarantine_patterns(uuid),
  rosetta_replay.truth_first_campaign_progress(uuid),
  rosetta_replay.emit_truth_first_checkpoints(uuid),
  rosetta_replay.truth_first_campaign_supervise(uuid),
  rosetta_replay.start_truth_first_replay_campaign(
    text,uuid,text,text,text,text,integer,integer,integer),
  rosetta_replay.start_replay_campaign(
    text,text,text,text,text,integer,integer,integer,integer),
  rosetta_replay.record_campaign_source_disposition(uuid,uuid,uuid,text),
  rosetta_replay.replay_campaign_reap_expired(uuid,integer),
  rosetta_replay.replay_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_refill(uuid),
  rosetta_replay.replay_campaign_progress(uuid),
  rosetta_replay.replay_campaign_finalize_next(uuid),
  rosetta_replay.replay_campaign_supervise(uuid),
  rosetta_replay.replay_campaign_truth_gate(uuid)
  from public;

do $privileges$
declare
  v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on table rosetta_replay.replay_campaign_membership_receipt, '
        'rosetta_replay.replay_campaign_member from %I',v_role);
      execute format(
        'revoke all on function '
        'rosetta_replay.reject_campaign_membership_mutation(), '
        'rosetta_replay.lock_frozen_campaign_identity(), '
        'rosetta_replay.require_truth_first_campaign_insert(), '
        'rosetta_replay.truth_first_campaign_header_valid(uuid), '
        'rosetta_replay.truth_first_cluster_token(text,text), '
        'rosetta_replay.truth_first_failure_code_bucket(text), '
        'rosetta_replay.block_truth_first_campaign_integrity(uuid,text,text,uuid), '
        'rosetta_replay.record_truth_first_disposition(uuid,uuid,uuid,text), '
        'rosetta_replay.enforce_truth_first_disposition_insert(), '
        'rosetta_replay.claim_attempt(uuid,text,text,text,text,text,interval), '
        'rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval), '
        'rosetta_replay.freeze_replay_campaign_membership(uuid,uuid), '
        'rosetta_replay.verify_replay_campaign_membership(uuid), '
        'rosetta_replay.reject_dispositioned_attempt_mutation(), '
        'rosetta_replay.guard_campaign_member_insert(), '
        'rosetta_replay.truth_first_campaign_reap_expired(uuid,integer), '
        'rosetta_replay.truth_first_campaign_sync_dispositions(uuid), '
        'rosetta_replay.replay_campaign_claim_source(uuid,uuid), '
        'rosetta_replay.truth_first_campaign_claim_refill(uuid), '
        'rosetta_replay.truth_first_replay_execute(uuid,text,integer), '
        'rosetta_replay.truth_observation_configuration_hash(uuid), '
        'rosetta_replay.truth_observation_claim('
        'uuid,uuid,text,text,text,text,text,text,interval), '
        'rosetta_replay.truth_observation_execute(uuid,uuid,text,integer), '
        'rosetta_replay.truth_observation_finalize(uuid,uuid,text), '
        'rosetta_replay.truth_first_campaign_execute_next(uuid), '
        'rosetta_replay.quarantine_finalize_failure('
        'uuid,uuid,uuid,text,text,text,text,text,text,jsonb), '
        'rosetta_replay.handle_truth_first_finalize_error('
        'uuid,uuid,uuid,text,text,text,text,text,text,jsonb), '
        'rosetta_replay.truth_first_campaign_finalize_next(uuid), '
        'rosetta_replay.truth_first_quarantine_thresholds(bigint,bigint), '
        'rosetta_replay.truth_first_quarantine_patterns(uuid), '
        'rosetta_replay.truth_first_campaign_progress(uuid), '
        'rosetta_replay.emit_truth_first_checkpoints(uuid), '
        'rosetta_replay.truth_first_campaign_supervise(uuid), '
        'rosetta_replay.start_truth_first_replay_campaign('
        'text,uuid,text,text,text,text,integer,integer,integer), '
        'rosetta_replay.start_replay_campaign('
        'text,text,text,text,text,integer,integer,integer,integer), '
        'rosetta_replay.record_campaign_source_disposition(uuid,uuid,uuid,text), '
        'rosetta_replay.replay_campaign_reap_expired(uuid,integer), '
        'rosetta_replay.replay_campaign_sync_dispositions(uuid), '
        'rosetta_replay.replay_campaign_claim_refill(uuid), '
        'rosetta_replay.replay_campaign_progress(uuid), '
        'rosetta_replay.replay_campaign_finalize_next(uuid), '
        'rosetta_replay.replay_campaign_supervise(uuid), '
        'rosetta_replay.replay_campaign_truth_gate(uuid) from %I',
        v_role);
    end if;
  end loop;
end;
$privileges$;

grant select on table
  rosetta_replay.replay_campaign_membership_receipt,
  rosetta_replay.replay_campaign_member
  to postgres;
grant execute on function
  rosetta_replay.reject_campaign_membership_mutation(),
  rosetta_replay.lock_frozen_campaign_identity(),
  rosetta_replay.require_truth_first_campaign_insert(),
  rosetta_replay.truth_first_campaign_header_valid(uuid),
  rosetta_replay.truth_first_cluster_token(text,text),
  rosetta_replay.truth_first_failure_code_bucket(text),
  rosetta_replay.block_truth_first_campaign_integrity(uuid,text,text,uuid),
  rosetta_replay.record_truth_first_disposition(uuid,uuid,uuid,text),
  rosetta_replay.enforce_truth_first_disposition_insert(),
  rosetta_replay.claim_attempt(uuid,text,text,text,text,text,interval),
  rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval),
  rosetta_replay.freeze_replay_campaign_membership(uuid,uuid),
  rosetta_replay.verify_replay_campaign_membership(uuid),
  rosetta_replay.reject_dispositioned_attempt_mutation(),
  rosetta_replay.guard_campaign_member_insert(),
  rosetta_replay.truth_first_campaign_reap_expired(uuid,integer),
  rosetta_replay.truth_first_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_source(uuid,uuid),
  rosetta_replay.truth_first_campaign_claim_refill(uuid),
  rosetta_replay.truth_first_replay_execute(uuid,text,integer),
  rosetta_replay.truth_observation_configuration_hash(uuid),
  rosetta_replay.truth_observation_claim(
    uuid,uuid,text,text,text,text,text,text,interval),
  rosetta_replay.truth_observation_execute(uuid,uuid,text,integer),
  rosetta_replay.truth_observation_finalize(uuid,uuid,text),
  rosetta_replay.truth_first_campaign_execute_next(uuid),
  rosetta_replay.quarantine_finalize_failure(
    uuid,uuid,uuid,text,text,text,text,text,text,jsonb),
  rosetta_replay.handle_truth_first_finalize_error(
    uuid,uuid,uuid,text,text,text,text,text,text,jsonb),
  rosetta_replay.truth_first_campaign_finalize_next(uuid),
  rosetta_replay.truth_first_quarantine_thresholds(bigint,bigint),
  rosetta_replay.truth_first_quarantine_patterns(uuid),
  rosetta_replay.truth_first_campaign_progress(uuid),
  rosetta_replay.emit_truth_first_checkpoints(uuid),
  rosetta_replay.truth_first_campaign_supervise(uuid),
  rosetta_replay.start_truth_first_replay_campaign(
    text,uuid,text,text,text,text,integer,integer,integer),
  rosetta_replay.start_replay_campaign(
    text,text,text,text,text,integer,integer,integer,integer),
  rosetta_replay.record_campaign_source_disposition(uuid,uuid,uuid,text),
  rosetta_replay.replay_campaign_reap_expired(uuid,integer),
  rosetta_replay.replay_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_refill(uuid),
  rosetta_replay.replay_campaign_progress(uuid),
  rosetta_replay.replay_campaign_finalize_next(uuid),
  rosetta_replay.replay_campaign_supervise(uuid),
  rosetta_replay.replay_campaign_truth_gate(uuid)
  to postgres;

commit;
