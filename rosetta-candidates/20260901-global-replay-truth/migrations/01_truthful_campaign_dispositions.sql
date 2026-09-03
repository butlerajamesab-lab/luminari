-- ============================================================================
-- Global replay truth contract
--
-- A replay campaign is allowed to finish with a truthful non-pass outcome.
-- Parser success remains an exact source -> attempt -> run binding.  Timeouts,
-- exhausted retries, and terminal infrastructure failures are recorded in a
-- separate immutable campaign/source disposition ledger because they are
-- campaign-budget outcomes, not reusable parser results.
--
-- No document identity, source URL, jurisdiction, bill number, or content hash
-- participates in any decision below.
-- ============================================================================

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign') is null
     or to_regclass('rosetta_replay.replay_attempt') is null
     or to_regclass('rosetta_replay.replay_run_binding') is null
     or to_regclass('rosetta_replay.replay_source_registry') is null
     or to_regclass('rosetta_replay.replay_receipt') is null then
    raise exception 'global replay truth contract requires the installed replay substrate'
      using errcode = 'P1C05';
  end if;
end;
$preflight$;

alter table rosetta_replay.replay_campaign
  add column if not exists replay_result text not null default 'pending';

alter table rosetta_replay.replay_campaign
  drop constraint if exists replay_campaign_replay_result_check;
alter table rosetta_replay.replay_campaign
  add constraint replay_campaign_replay_result_check
  check (replay_result in ('pending','pass','nonpass'));

alter table rosetta_replay.replay_campaign_event
  drop constraint if exists replay_campaign_event_event_kind_check;
alter table rosetta_replay.replay_campaign_event
  add constraint replay_campaign_event_event_kind_check
  check (event_kind in (
    'started','completed','blocked','stopped',
    'lease_expired','disposition_recorded'
  ));

create table if not exists rosetta_replay.replay_campaign_source_disposition (
  disposition_id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references rosetta_replay.replay_campaign(campaign_id),
  source_registry_id uuid not null
    references rosetta_replay.replay_source_registry(source_registry_id),
  attempt_id uuid not null
    references rosetta_replay.replay_attempt(attempt_id),
  receipt_id uuid not null
    references rosetta_replay.replay_receipt(receipt_id),
  source_content_id uuid not null,
  source_content_hash text not null,
  engine_version text not null,
  rule_set_version text not null,
  configuration_hash text not null,
  closure_hash text not null,
  retry_seq integer not null check (retry_seq >= 0),
  disposition text not null check (disposition in (
    'completed','rejected','deferred_oversized',
    'timed_out','retry_exhausted','failed_terminal'
  )),
  failure_code text,
  failure_detail text,
  disposition_sha256 text not null
    check (disposition_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (campaign_id, source_registry_id),
  unique (campaign_id, attempt_id),
  check (
    (disposition in ('completed','deferred_oversized') and failure_code is null)
    or
    (disposition in ('rejected','timed_out','retry_exhausted','failed_terminal')
      and nullif(btrim(failure_code),'') is not null)
  )
);

comment on table rosetta_replay.replay_campaign_source_disposition is
  'Immutable per-campaign accounting of every eligible source. Completion is coverage; only completed dispositions are replay passes.';

alter table rosetta_replay.replay_campaign_source_disposition enable row level security;
revoke all on table rosetta_replay.replay_campaign_source_disposition
  from public, anon, authenticated, service_role;

create or replace function rosetta_replay.reject_campaign_disposition_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
begin
  raise exception 'replay_campaign_source_disposition_is_immutable'
    using errcode = 'raise_exception';
end;
$function$;

drop trigger if exists replay_campaign_source_disposition_immutable
  on rosetta_replay.replay_campaign_source_disposition;
create trigger replay_campaign_source_disposition_immutable
before update or delete on rosetta_replay.replay_campaign_source_disposition
for each row execute function rosetta_replay.reject_campaign_disposition_mutation();

create or replace function rosetta_replay.record_campaign_source_disposition(
  p_campaign_id uuid,
  p_source_registry_id uuid,
  p_attempt_id uuid,
  p_disposition text)
returns uuid
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay', 'rosetta_v2513', 'extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  s rosetta_replay.replay_source_registry%rowtype;
  a rosetta_replay.replay_attempt%rowtype;
  b rosetta_replay.replay_run_binding%rowtype;
  r rosetta_replay.replay_receipt%rowtype;
  v_closure_hash text;
  v_failure_code text;
  v_failure_detail text;
  v_receipt_kind text;
  v_sha text;
  v_id uuid;
  v_existing rosetta_replay.replay_campaign_source_disposition%rowtype;
begin
  if p_disposition not in (
    'completed','rejected','deferred_oversized',
    'timed_out','retry_exhausted','failed_terminal'
  ) then
    raise exception 'unsupported campaign source disposition: %', p_disposition
      using errcode = '22023';
  end if;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;

  select * into strict s
  from rosetta_replay.replay_source_registry
  where source_registry_id = p_source_registry_id;

  select * into strict a
  from rosetta_replay.replay_attempt
  where attempt_id = p_attempt_id
  for update;

  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  if not rosetta_replay.replay_campaign_source_eligible(
       p_source_registry_id, c.closure_prefix)
     or a.source_registry_id is distinct from p_source_registry_id
     or a.engine_version is distinct from c.engine_version
     or a.rule_set_version is distinct from c.rule_set_version
     or a.closure_hash is distinct from v_closure_hash
     or a.config_hash is distinct from
       rosetta_replay.expected_configuration_hash(p_source_registry_id) then
    raise exception 'campaign disposition identity mismatch for source %',
      p_source_registry_id using errcode = 'P1C05';
  end if;

  if p_disposition in ('completed','rejected','deferred_oversized') then
    select * into strict b
    from rosetta_replay.replay_run_binding
    where attempt_id = p_attempt_id
      and source_registry_id = p_source_registry_id
      and source_content_id = s.source_content_id
      and source_content_hash = s.source_content_hash
      and engine_version = c.engine_version
      and rule_set_version = c.rule_set_version
      and configuration_hash = a.config_hash
      and closure_hash = v_closure_hash
      and terminal_outcome = p_disposition;
  elsif exists (
    select 1 from rosetta_replay.replay_attempt newer
    where newer.attempt_identity = a.attempt_identity
      and newer.retry_seq > a.retry_seq
  ) then
    raise exception 'campaign non-pass disposition is not the latest retry for source %',
      p_source_registry_id using errcode = 'P1C05';
  end if;

  if p_disposition = 'completed' and a.attempt_state <> 'succeeded' then
    raise exception 'completed disposition requires a succeeded attempt'
      using errcode = 'P1C05';
  elsif p_disposition = 'rejected' and a.attempt_state <> 'rejected' then
    raise exception 'rejected disposition requires a rejected attempt'
      using errcode = 'P1C05';
  elsif p_disposition = 'deferred_oversized'
        and a.attempt_state <> 'deferred_oversized' then
    raise exception 'deferred disposition requires a deferred attempt'
      using errcode = 'P1C05';
  elsif p_disposition = 'timed_out'
        and (a.attempt_state <> 'timed_out' or a.retry_seq < c.max_retry_seq) then
    raise exception 'timed-out disposition requires an exhausted timeout retry chain'
      using errcode = 'P1C05';
  elsif p_disposition = 'retry_exhausted'
        and (a.attempt_state <> 'failed_retryable'
             or a.retry_seq < c.max_retry_seq) then
    raise exception 'retry-exhausted disposition requires an exhausted retryable chain'
      using errcode = 'P1C05';
  elsif p_disposition = 'failed_terminal'
        and a.attempt_state <> 'failed_terminal' then
    raise exception 'failed-terminal disposition requires a terminal failure attempt'
      using errcode = 'P1C05';
  end if;

  v_receipt_kind := case p_disposition
    when 'completed' then 'success'
    when 'rejected' then 'rejection'
    when 'deferred_oversized' then 'deferred'
    when 'timed_out' then 'timeout'
    when 'retry_exhausted' then 'retryable_failure'
    when 'failed_terminal' then 'terminal_failure'
  end;

  select receipt.* into strict r
  from rosetta_replay.replay_receipt receipt
  where receipt.attempt_id = p_attempt_id
    and receipt.receipt_kind = v_receipt_kind
  order by receipt.receipt_seq desc
  limit 1;

  v_failure_code := case p_disposition
    when 'rejected' then coalesce(b.failure_code, r.sqlstate, 'engine_rejected')
    when 'timed_out' then coalesce(r.sqlstate, '57014')
    when 'retry_exhausted' then coalesce(r.sqlstate, 'retry_exhausted')
    when 'failed_terminal' then coalesce(r.sqlstate, 'failed_terminal')
    else null
  end;
  v_failure_detail := nullif(left(coalesce(r.error_detail, ''), 4000), '');

  v_sha := encode(extensions.digest(convert_to(jsonb_build_object(
    'campaign_id', c.campaign_id,
    'source_registry_id', s.source_registry_id,
    'source_content_id', s.source_content_id,
    'source_content_hash', s.source_content_hash,
    'attempt_id', a.attempt_id,
    'receipt_id', r.receipt_id,
    'engine_version', c.engine_version,
    'rule_set_version', c.rule_set_version,
    'configuration_hash', a.config_hash,
    'closure_hash', v_closure_hash,
    'retry_seq', a.retry_seq,
    'disposition', p_disposition,
    'failure_code', v_failure_code
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into rosetta_replay.replay_campaign_source_disposition (
    campaign_id, source_registry_id, attempt_id, receipt_id,
    source_content_id, source_content_hash,
    engine_version, rule_set_version, configuration_hash, closure_hash,
    retry_seq, disposition, failure_code, failure_detail,
    disposition_sha256)
  values (
    c.campaign_id, s.source_registry_id, a.attempt_id, r.receipt_id,
    s.source_content_id, s.source_content_hash,
    c.engine_version, c.rule_set_version, a.config_hash, v_closure_hash,
    a.retry_seq, p_disposition, v_failure_code, v_failure_detail,
    v_sha)
  on conflict (campaign_id, source_registry_id) do nothing
  returning disposition_id into v_id;

  if v_id is null then
    select * into strict v_existing
    from rosetta_replay.replay_campaign_source_disposition
    where campaign_id = p_campaign_id
      and source_registry_id = p_source_registry_id;
    if v_existing.attempt_id is distinct from p_attempt_id
       or v_existing.disposition is distinct from p_disposition
       or v_existing.disposition_sha256 is distinct from v_sha then
      raise exception 'campaign source already has a different immutable disposition'
        using errcode = 'P1C05';
    end if;
    return v_existing.disposition_id;
  end if;

  insert into rosetta_replay.replay_campaign_event (
    campaign_id, event_kind, attempt_id, event_payload)
  values (
    p_campaign_id, 'disposition_recorded', p_attempt_id,
    jsonb_build_object(
      'source_registry_id', p_source_registry_id,
      'disposition', p_disposition,
      'disposition_sha256', v_sha));

  return v_id;
end;
$function$;

create or replace function rosetta_replay.replay_campaign_reap_expired(
  p_campaign_id uuid,
  p_limit integer default 128)
returns integer
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_closure_hash text;
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
  where campaign_id = p_campaign_id
  for update;
  if c.campaign_state <> 'running' then
    return 0;
  end if;

  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  for expired in
    select a.attempt_id, a.source_registry_id, a.retry_seq,
           a.lease_expires_at
    from rosetta_replay.replay_attempt a
    where a.engine_version = c.engine_version
      and a.rule_set_version = c.rule_set_version
      and a.closure_hash = v_closure_hash
      and a.attempt_state in ('claimed','running')
      and a.pending_outcome is null
      and a.lease_expires_at is not null
      and a.lease_expires_at <= clock_timestamp()
      and rosetta_replay.replay_campaign_source_eligible(
        a.source_registry_id, c.closure_prefix)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition d
        where d.campaign_id = p_campaign_id
          and d.source_registry_id = a.source_registry_id)
      and not exists (
        select 1 from rosetta_replay.replay_attempt newer
        where newer.attempt_identity = a.attempt_identity
          and newer.retry_seq > a.retry_seq)
    order by a.lease_expires_at, a.attempt_id
    limit p_limit
    for update skip locked
  loop
    v_receipt := rosetta_replay.finalize_attempt(
      expired.attempt_id,
      'timeout',
      '57014',
      'worker lease expired before a terminal outcome was staged',
      c.worker_identity,
      jsonb_build_object(
        'timeout_scope', 'worker_lease',
        'campaign_id', p_campaign_id,
        'lease_expires_at', expired.lease_expires_at,
        'retry_seq', expired.retry_seq));

    insert into rosetta_replay.replay_campaign_event (
      campaign_id, event_kind, attempt_id, event_payload)
    values (
      p_campaign_id, 'lease_expired', expired.attempt_id,
      jsonb_build_object(
        'source_registry_id', expired.source_registry_id,
        'receipt_id', v_receipt,
        'retry_seq', expired.retry_seq));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

create or replace function rosetta_replay.replay_campaign_sync_dispositions(
  p_campaign_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_closure_hash text;
  candidate record;
  v_disposition text;
  v_count integer := 0;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;
  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);

  for candidate in
    select source.source_registry_id,
           binding.attempt_id as binding_attempt_id,
           binding.terminal_outcome,
           latest.attempt_id as latest_attempt_id,
           latest.attempt_state,
           latest.retry_seq
    from rosetta_replay.replay_source_registry source
    left join lateral (
      select b.attempt_id, b.terminal_outcome
      from rosetta_replay.replay_run_binding b
      where b.source_registry_id = source.source_registry_id
        and b.engine_version = c.engine_version
        and b.rule_set_version = c.rule_set_version
        and b.closure_hash = v_closure_hash
      order by b.bound_at desc, b.attempt_id
      limit 1
    ) binding on true
    left join lateral (
      select a.attempt_id, a.attempt_state, a.retry_seq
      from rosetta_replay.replay_attempt a
      where a.source_registry_id = source.source_registry_id
        and a.engine_version = c.engine_version
        and a.rule_set_version = c.rule_set_version
        and a.closure_hash = v_closure_hash
      order by a.retry_seq desc, a.attempt_id desc
      limit 1
    ) latest on true
    where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id, c.closure_prefix)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.source_registry_id = source.source_registry_id)
    order by source.source_content_hash, source.source_content_id
  loop
    v_disposition := case
      when candidate.binding_attempt_id is not null
        then candidate.terminal_outcome
      when candidate.attempt_state = 'failed_terminal'
        then 'failed_terminal'
      when candidate.attempt_state = 'timed_out'
           and candidate.retry_seq >= c.max_retry_seq
        then 'timed_out'
      when candidate.attempt_state = 'failed_retryable'
           and candidate.retry_seq >= c.max_retry_seq
        then 'retry_exhausted'
      else null
    end;

    if v_disposition is not null then
      perform rosetta_replay.record_campaign_source_disposition(
        p_campaign_id,
        candidate.source_registry_id,
        coalesce(candidate.binding_attempt_id, candidate.latest_attempt_id),
        v_disposition);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

create or replace function rosetta_replay.replay_campaign_claim_refill(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  source record;
  v_hash text;
  v_inflight integer;
  v_need integer;
  v_config text;
  v_attempt uuid;
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

  v_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  select count(*) into v_inflight
  from rosetta_replay.replay_attempt attempt
  where attempt.engine_version = c.engine_version
    and attempt.rule_set_version = c.rule_set_version
    and attempt.closure_hash = v_hash
    and attempt.attempt_state in ('claimed','running')
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.source_registry_id = attempt.source_registry_id);

  v_need := greatest(c.queue_depth - v_inflight, 0);
  if v_need = 0 then
    return jsonb_build_object(
      'phase','claim','claimed',0,'inflight',v_inflight);
  end if;

  for source in
    select registry.source_registry_id,
           registry.source_content_hash,
           registry.source_content_id
    from rosetta_replay.replay_source_registry registry
    left join lateral (
      select attempt.attempt_state, attempt.retry_seq
      from rosetta_replay.replay_attempt attempt
      where attempt.source_registry_id = registry.source_registry_id
        and attempt.engine_version = c.engine_version
        and attempt.rule_set_version = c.rule_set_version
        and attempt.closure_hash = v_hash
      order by attempt.retry_seq desc
      limit 1
    ) latest on true
    where rosetta_replay.replay_campaign_source_eligible(
      registry.source_registry_id, c.closure_prefix)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.source_registry_id = registry.source_registry_id)
      and not exists (
        select 1
        from rosetta_replay.replay_run_binding binding
        where binding.source_registry_id = registry.source_registry_id
          and binding.engine_version = c.engine_version
          and binding.rule_set_version = c.rule_set_version
          and binding.closure_hash = v_hash)
      and (
        latest.attempt_state is null
        or (
          latest.attempt_state in ('timed_out','failed_retryable')
          and latest.retry_seq < c.max_retry_seq))
    order by registry.source_content_hash, registry.source_content_id
    limit v_need
  loop
    v_config := rosetta_replay.expected_configuration_hash(
      source.source_registry_id);
    v_attempt := rosetta_replay.replay_claim(
      source.source_registry_id,
      c.closure_prefix,
      c.engine_version,
      c.rule_set_version,
      v_config,
      v_hash,
      c.worker_identity,
      interval '15 minutes');
    v_claimed := v_claimed + 1;
  end loop;

  return jsonb_build_object(
    'phase','claim','claimed',v_claimed,
    'inflight_before',v_inflight,'queue_depth',c.queue_depth);
end;
$function$;

create or replace function rosetta_replay.replay_campaign_progress(
  p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_hash text;
  v_total bigint;
  v_bound bigint;
  v_accounted bigint;
  v_completed bigint;
  v_rejected bigint;
  v_deferred bigint;
  v_timed_out bigint;
  v_retry_exhausted bigint;
  v_failed_terminal bigint;
  v_running bigint;
  v_pending bigint;
  v_claimable bigint;
  v_terminal_orphans bigint;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  v_hash := rosetta_replay.closure_sha256(c.closure_prefix);

  select count(*) into v_total
  from rosetta_replay.replay_source_registry source
  where rosetta_replay.replay_campaign_source_eligible(
    source.source_registry_id, c.closure_prefix);

  select count(distinct binding.source_registry_id) into v_bound
  from rosetta_replay.replay_run_binding binding
  where binding.engine_version = c.engine_version
    and binding.rule_set_version = c.rule_set_version
    and binding.closure_hash = v_hash
    and rosetta_replay.replay_campaign_source_eligible(
      binding.source_registry_id, c.closure_prefix);

  select count(*),
         count(*) filter (where disposition = 'completed'),
         count(*) filter (where disposition = 'rejected'),
         count(*) filter (where disposition = 'deferred_oversized'),
         count(*) filter (where disposition = 'timed_out'),
         count(*) filter (where disposition = 'retry_exhausted'),
         count(*) filter (where disposition = 'failed_terminal')
    into v_accounted, v_completed, v_rejected, v_deferred,
         v_timed_out, v_retry_exhausted, v_failed_terminal
  from rosetta_replay.replay_campaign_source_disposition disposition
  where disposition.campaign_id = p_campaign_id;

  select count(*),
         count(*) filter (where attempt.pending_outcome is not null)
    into v_running, v_pending
  from rosetta_replay.replay_attempt attempt
  where attempt.engine_version = c.engine_version
    and attempt.rule_set_version = c.rule_set_version
    and attempt.closure_hash = v_hash
    and attempt.attempt_state in ('claimed','running')
    and rosetta_replay.replay_campaign_source_eligible(
      attempt.source_registry_id, c.closure_prefix)
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.source_registry_id = attempt.source_registry_id);

  with eligible as (
    select source.source_registry_id
    from rosetta_replay.replay_source_registry source
    where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id, c.closure_prefix)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.source_registry_id = source.source_registry_id)
      and not exists (
        select 1 from rosetta_replay.replay_run_binding binding
        where binding.source_registry_id = source.source_registry_id
          and binding.engine_version = c.engine_version
          and binding.rule_set_version = c.rule_set_version
          and binding.closure_hash = v_hash)
  ), latest as (
    select eligible.source_registry_id,
           attempt.attempt_state,
           attempt.retry_seq
    from eligible
    left join lateral (
      select candidate.attempt_state, candidate.retry_seq
      from rosetta_replay.replay_attempt candidate
      where candidate.source_registry_id = eligible.source_registry_id
        and candidate.engine_version = c.engine_version
        and candidate.rule_set_version = c.rule_set_version
        and candidate.closure_hash = v_hash
      order by candidate.retry_seq desc
      limit 1
    ) attempt on true
  )
  select count(*) filter (
           where attempt_state is null
              or (attempt_state in ('timed_out','failed_retryable')
                  and retry_seq < c.max_retry_seq)),
         count(*) filter (
           where attempt_state in ('succeeded','rejected','deferred_oversized'))
    into v_claimable, v_terminal_orphans
  from latest;

  return jsonb_build_object(
    'campaign_id', c.campaign_id,
    'campaign_name', c.campaign_name,
    'campaign_state', c.campaign_state,
    'replay_result', c.replay_result,
    'coverage_complete', v_total = v_accounted,
    'promotion_eligible',
      c.campaign_state = 'completed' and c.replay_result = 'pass',
    'closure_prefix', c.closure_prefix,
    'closure_hash', v_hash,
    'engine_version', c.engine_version,
    'rule_set_version', c.rule_set_version,
    'source_total', v_total,
    'accounted_sources', v_accounted,
    'passed_sources', v_completed,
    'nonpass_sources',
      v_rejected + v_deferred + v_timed_out
      + v_retry_exhausted + v_failed_terminal,
    'completed_sources', v_completed,
    'rejected_sources', v_rejected,
    'deferred_sources', v_deferred,
    'timed_out_sources', v_timed_out,
    'retry_exhausted_sources', v_retry_exhausted,
    'failed_terminal_sources', v_failed_terminal,
    'bound_sources', v_bound,
    'remaining_sources', v_total - v_accounted,
    'running_attempts', v_running,
    'pending_finalize', v_pending,
    'claimable_sources', v_claimable,
    'terminal_orphans', v_terminal_orphans,
    'executor_count', c.executor_count,
    'timeout_ms', c.timeout_ms,
    'cron_job_ids', to_jsonb(c.cron_job_ids),
    'last_error_code', c.last_error_code,
    'last_error_detail', c.last_error_detail,
    'started_at', c.started_at,
    'finished_at', c.finished_at);
end;
$function$;

create or replace function rosetta_replay.replay_campaign_supervise(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  progress jsonb;
  v_result text;
  v_unscheduled integer := 0;
  v_sqlstate text;
  v_error text;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;

  if c.campaign_state = 'running' then
    begin
      perform rosetta_replay.replay_campaign_reap_expired(p_campaign_id);
      perform rosetta_replay.replay_campaign_sync_dispositions(p_campaign_id);
    exception when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;
      update rosetta_replay.replay_campaign
      set campaign_state = 'blocked',
          replay_result = 'nonpass',
          finished_at = clock_timestamp(),
          last_error_code = coalesce(v_sqlstate, 'P1C05'),
          last_error_detail = left(coalesce(v_error,
            'campaign disposition reconciliation failed'), 4000)
      where campaign_id = p_campaign_id;
      insert into rosetta_replay.replay_campaign_event (
        campaign_id, event_kind, event_payload)
      values (
        p_campaign_id, 'blocked',
        jsonb_build_object(
          'sqlstate', coalesce(v_sqlstate, 'P1C05'),
          'error', left(coalesce(v_error,
            'campaign disposition reconciliation failed'), 4000),
          'fail_closed', true));
    end;
  end if;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for update;
  progress := rosetta_replay.replay_campaign_progress(p_campaign_id);

  if c.campaign_state = 'running'
     and (progress->>'terminal_orphans')::bigint > 0 then
    update rosetta_replay.replay_campaign
    set campaign_state = 'blocked',
        replay_result = 'nonpass',
        finished_at = clock_timestamp(),
        last_error_code = 'P1C05',
        last_error_detail =
          'terminal parser attempts exist without exact immutable bindings'
    where campaign_id = p_campaign_id;
    insert into rosetta_replay.replay_campaign_event (
      campaign_id, event_kind, event_payload)
    values (
      p_campaign_id, 'blocked',
      progress || jsonb_build_object(
        'sqlstate','P1C05','fail_closed',true));
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);

  elsif c.campaign_state = 'running'
        and (progress->>'remaining_sources')::bigint = 0
        and (progress->>'running_attempts')::bigint = 0 then
    v_result := case
      when (progress->>'nonpass_sources')::bigint = 0 then 'pass'
      else 'nonpass'
    end;
    update rosetta_replay.replay_campaign
    set campaign_state = 'completed',
        replay_result = v_result,
        finished_at = clock_timestamp(),
        last_error_code = null,
        last_error_detail = null
    where campaign_id = p_campaign_id;
    insert into rosetta_replay.replay_campaign_event (
      campaign_id, event_kind, event_payload)
    values (
      p_campaign_id, 'completed',
      progress || jsonb_build_object(
        'replay_result', v_result,
        'coverage_complete', true,
        'promotion_eligible', v_result = 'pass'));
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);

  elsif c.campaign_state = 'running'
        and (progress->>'running_attempts')::bigint = 0
        and (progress->>'claimable_sources')::bigint = 0
        and (progress->>'remaining_sources')::bigint > 0 then
    update rosetta_replay.replay_campaign
    set campaign_state = 'blocked',
        replay_result = 'nonpass',
        finished_at = clock_timestamp(),
        last_error_code = 'P1C05',
        last_error_detail =
          'eligible sources remain without a claimable attempt or terminal disposition'
    where campaign_id = p_campaign_id;
    insert into rosetta_replay.replay_campaign_event (
      campaign_id, event_kind, event_payload)
    values (
      p_campaign_id, 'blocked',
      progress || jsonb_build_object(
        'sqlstate','P1C05','fail_closed',true));
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);

  elsif c.campaign_state in ('blocked','completed','stopped') then
    v_unscheduled :=
      rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  end if;

  return rosetta_replay.replay_campaign_progress(p_campaign_id)
    || jsonb_build_object('jobs_unscheduled', v_unscheduled);
end;
$function$;

create or replace function rosetta_replay.replay_campaign_universal_gate(
  p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog', 'rosetta_replay', 'rosetta_v2513'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  progress jsonb;
  v_bad bigint;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  progress := rosetta_replay.replay_campaign_progress(p_campaign_id);

  if c.campaign_state <> 'completed'
     or c.replay_result <> 'pass'
     or (progress->>'coverage_complete')::boolean is not true
     or (progress->>'source_total')::bigint <= 0
     or (progress->>'accounted_sources')::bigint
          <> (progress->>'source_total')::bigint
     or (progress->>'passed_sources')::bigint
          <> (progress->>'source_total')::bigint
     or (progress->>'nonpass_sources')::bigint <> 0
     or (progress->>'remaining_sources')::bigint <> 0
     or (progress->>'running_attempts')::bigint <> 0
     or (progress->>'pending_finalize')::bigint <> 0
     or (progress->>'terminal_orphans')::bigint <> 0 then
    raise exception 'campaign % is fully accounted but not a universal pass: %',
      p_campaign_id, progress using errcode = 'P1C06';
  end if;

  with invalid_disposition as (
    select disposition.source_registry_id
    from rosetta_replay.replay_campaign_source_disposition disposition
    left join rosetta_replay.replay_source_registry source
      on source.source_registry_id = disposition.source_registry_id
     and source.source_content_id = disposition.source_content_id
     and source.source_content_hash = disposition.source_content_hash
    left join rosetta_replay.replay_attempt attempt
      on attempt.attempt_id = disposition.attempt_id
     and attempt.source_registry_id = disposition.source_registry_id
     and attempt.engine_version = disposition.engine_version
     and attempt.rule_set_version = disposition.rule_set_version
     and attempt.config_hash = disposition.configuration_hash
     and attempt.closure_hash = disposition.closure_hash
     and attempt.retry_seq = disposition.retry_seq
     and attempt.attempt_state = 'succeeded'
    left join rosetta_replay.replay_receipt receipt
      on receipt.receipt_id = disposition.receipt_id
     and receipt.attempt_id = disposition.attempt_id
     and receipt.receipt_kind = 'success'
    left join rosetta_replay.replay_run_binding binding
      on binding.attempt_id = disposition.attempt_id
     and binding.source_registry_id = disposition.source_registry_id
     and binding.source_content_id = disposition.source_content_id
     and binding.source_content_hash = disposition.source_content_hash
     and binding.engine_version = disposition.engine_version
     and binding.rule_set_version = disposition.rule_set_version
     and binding.configuration_hash = disposition.configuration_hash
     and binding.closure_hash = disposition.closure_hash
     and binding.terminal_outcome = 'completed'
    left join rosetta_v2513.extraction_run run
      on run.id = binding.extraction_run_id
     and run.source_document_id = binding.source_document_id
     and run.source_content_id = binding.source_content_id
     and run.source_content_hash = binding.source_content_hash
     and run.engine_version = binding.engine_version
     and run.rule_set_version = binding.rule_set_version
     and run.configuration_hash = binding.configuration_hash
     and run.output_content_hash = binding.output_content_hash
     and run.run_status = 'completed'
     and run.admissibility_state = 'admissible'
    where disposition.campaign_id = p_campaign_id
      and (
        disposition.disposition <> 'completed'
        or disposition.engine_version is distinct from c.engine_version
        or disposition.rule_set_version is distinct from c.rule_set_version
        or disposition.closure_hash is distinct from progress->>'closure_hash'
        or not rosetta_replay.replay_campaign_source_eligible(
          disposition.source_registry_id, c.closure_prefix)
        or source.source_registry_id is null
        or attempt.attempt_id is null
        or receipt.receipt_id is null
        or binding.attempt_id is null
        or run.id is null)
  ), missing_disposition as (
    select source.source_registry_id
    from rosetta_replay.replay_source_registry source
    where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id, c.closure_prefix)
      and not exists (
        select 1
        from rosetta_replay.replay_campaign_source_disposition disposition
        where disposition.campaign_id = p_campaign_id
          and disposition.source_registry_id = source.source_registry_id)
  )
  select count(*) into v_bad
  from (
    select source_registry_id from invalid_disposition
    union all
    select source_registry_id from missing_disposition
  ) problem;
  if v_bad <> 0 then
    raise exception '% campaign dispositions violate the exact universal binding contract',
      v_bad using errcode = 'P1C06';
  end if;

  return jsonb_build_object(
    'gate','passed',
    'scope','universal_authorized_corpus',
    'campaign_id',p_campaign_id,
    'source_count',(progress->>'source_total')::bigint,
    'completed_sources',(progress->>'passed_sources')::bigint,
    'nonpass_sources',0,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'closure_prefix',c.closure_prefix,
    'closure_hash',progress->>'closure_hash');
end;
$function$;

-- All replay controls are postgres/cron-internal. CREATE OR REPLACE preserves
-- existing ACLs, while new functions would otherwise inherit EXECUTE by PUBLIC.
revoke all on function
  rosetta_replay.reject_campaign_disposition_mutation()
  from public, anon, authenticated, service_role;
revoke all on function
  rosetta_replay.record_campaign_source_disposition(uuid,uuid,uuid,text),
  rosetta_replay.replay_campaign_reap_expired(uuid,integer),
  rosetta_replay.replay_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_refill(uuid),
  rosetta_replay.replay_campaign_progress(uuid),
  rosetta_replay.replay_campaign_supervise(uuid),
  rosetta_replay.replay_campaign_universal_gate(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  rosetta_replay.reject_campaign_disposition_mutation(),
  rosetta_replay.record_campaign_source_disposition(uuid,uuid,uuid,text),
  rosetta_replay.replay_campaign_reap_expired(uuid,integer),
  rosetta_replay.replay_campaign_sync_dispositions(uuid),
  rosetta_replay.replay_campaign_claim_refill(uuid),
  rosetta_replay.replay_campaign_progress(uuid),
  rosetta_replay.replay_campaign_supervise(uuid),
  rosetta_replay.replay_campaign_universal_gate(uuid)
  to postgres;
