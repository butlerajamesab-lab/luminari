-- Rosetta 2.5.13: bounded, resumable full-corpus replay campaign.
-- Each executor job processes exactly one source in one committed transaction.
-- Campaign jobs automatically unschedule on completion, blocker, or stop.

do $block$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron')
     and not exists(select 1 from pg_extension where extname='pg_cron') then
    execute 'create extension pg_cron';
  end if;
end;
$block$;

create table if not exists rosetta_replay.replay_campaign (
    campaign_id uuid primary key default gen_random_uuid(),
    campaign_name text not null unique,
    closure_prefix text not null check (closure_prefix in ('ctl_','v2513_')),
    engine_version text not null,
    rule_set_version text not null,
    worker_identity text not null,
    timeout_ms integer not null default 120000 check (timeout_ms between 1000 and 600000),
    max_retry_seq integer not null default 3 check (max_retry_seq between 0 and 20),
    executor_count integer not null default 4 check (executor_count between 1 and 4),
    queue_depth integer not null default 16 check (queue_depth between 1 and 128),
    campaign_state text not null default 'prepared'
      check (campaign_state in ('prepared','running','completed','blocked','stopped')),
    cron_job_ids bigint[] not null default '{}'::bigint[],
    last_error_code text,
    last_error_detail text,
    created_at timestamptz not null default clock_timestamp(),
    started_at timestamptz,
    finished_at timestamptz
);

create unique index if not exists replay_campaign_one_active_idx
on rosetta_replay.replay_campaign ((true)) where campaign_state='running';

create table if not exists rosetta_replay.replay_campaign_event (
    event_id bigint generated always as identity primary key,
    campaign_id uuid not null references rosetta_replay.replay_campaign,
    event_kind text not null check (event_kind in ('started','completed','blocked','stopped')),
    attempt_id uuid references rosetta_replay.replay_attempt,
    event_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default clock_timestamp()
);

create or replace function rosetta_replay.reject_campaign_event_mutation()
returns trigger language plpgsql set search_path to 'pg_catalog' as $fn$
begin
  raise exception 'replay_campaign_event_is_immutable' using errcode='raise_exception';
end;
$fn$;
drop trigger if exists replay_campaign_event_immutable on rosetta_replay.replay_campaign_event;
create trigger replay_campaign_event_immutable before update or delete
on rosetta_replay.replay_campaign_event for each row
execute function rosetta_replay.reject_campaign_event_mutation();

create index if not exists replay_attempt_campaign_pick_idx
on rosetta_replay.replay_attempt
  (engine_version,rule_set_version,closure_hash,attempt_state,claimed_at,attempt_id)
include (pending_outcome,retry_seq,source_registry_id);
create index if not exists replay_attempt_source_campaign_idx
on rosetta_replay.replay_attempt
  (source_registry_id,engine_version,rule_set_version,closure_hash,retry_seq desc)
include (attempt_state,pending_outcome);
create index if not exists replay_binding_campaign_progress_idx
on rosetta_replay.replay_run_binding
  (engine_version,rule_set_version,closure_hash,source_registry_id);

create or replace function rosetta_replay.replay_campaign_progress(p_campaign_id uuid)
returns jsonb language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_hash text;v_total bigint;v_bound bigint;v_running bigint;v_pending bigint;
  v_claimable bigint;v_retry_exhausted bigint;v_terminal_orphans bigint;
begin
  select * into strict c from rosetta_replay.replay_campaign where campaign_id=p_campaign_id;
  v_hash:=rosetta_replay.closure_sha256(c.closure_prefix);
  select count(*) into v_total from rosetta_replay.replay_source_registry r
  where c.closure_prefix='ctl_' or exists(
    select 1 from rosetta_replay.source_replay_expectation e
    where e.source_registry_id=r.source_registry_id);
  select count(distinct b.source_registry_id) into v_bound
  from rosetta_replay.replay_run_binding b
  where b.engine_version=c.engine_version and b.rule_set_version=c.rule_set_version
    and b.closure_hash=v_hash;
  select count(*),count(*) filter(where a.pending_outcome is not null)
  into v_running,v_pending from rosetta_replay.replay_attempt a
  where a.engine_version=c.engine_version and a.rule_set_version=c.rule_set_version
    and a.closure_hash=v_hash and a.attempt_state in ('claimed','running');
  with eligible as (
    select r.source_registry_id from rosetta_replay.replay_source_registry r
    where (c.closure_prefix='ctl_' or exists(
      select 1 from rosetta_replay.source_replay_expectation e
      where e.source_registry_id=r.source_registry_id))
      and not exists(select 1 from rosetta_replay.replay_run_binding b
        where b.source_registry_id=r.source_registry_id
          and b.engine_version=c.engine_version and b.rule_set_version=c.rule_set_version
          and b.closure_hash=v_hash)
  ), latest as (
    select e.source_registry_id,a.attempt_state,a.retry_seq from eligible e
    left join lateral (
      select x.attempt_state,x.retry_seq from rosetta_replay.replay_attempt x
      where x.source_registry_id=e.source_registry_id
        and x.engine_version=c.engine_version and x.rule_set_version=c.rule_set_version
        and x.closure_hash=v_hash order by x.retry_seq desc limit 1
    ) a on true
  )
  select count(*) filter(where attempt_state is null or
      (attempt_state in ('timed_out','failed_retryable') and retry_seq<c.max_retry_seq)),
    count(*) filter(where attempt_state in ('timed_out','failed_retryable')
      and retry_seq>=c.max_retry_seq),
    count(*) filter(where attempt_state in
      ('succeeded','rejected','deferred_oversized','failed_terminal'))
  into v_claimable,v_retry_exhausted,v_terminal_orphans from latest;
  return jsonb_build_object(
    'campaign_id',c.campaign_id,'campaign_name',c.campaign_name,
    'campaign_state',c.campaign_state,'closure_prefix',c.closure_prefix,
    'closure_hash',v_hash,'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,'source_total',v_total,
    'bound_sources',v_bound,'remaining_sources',v_total-v_bound,
    'running_attempts',v_running,'pending_finalize',v_pending,
    'claimable_sources',v_claimable,'retry_exhausted',v_retry_exhausted,
    'terminal_orphans',v_terminal_orphans,'executor_count',c.executor_count,
    'timeout_ms',c.timeout_ms,'cron_job_ids',to_jsonb(c.cron_job_ids),
    'last_error_code',c.last_error_code,'last_error_detail',c.last_error_detail,
    'started_at',c.started_at,'finished_at',c.finished_at);
end;
$fn$;

create or replace function rosetta_replay.replay_campaign_claim_refill(p_campaign_id uuid)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare
  c rosetta_replay.replay_campaign%rowtype;s record;v_hash text;
  v_inflight integer;v_need integer;v_config text;v_attempt uuid;v_claimed integer:=0;
begin
  select * into strict c from rosetta_replay.replay_campaign
  where campaign_id=p_campaign_id for update;
  if c.campaign_state<>'running' then
    return jsonb_build_object('phase','claim','claimed',0,'state',c.campaign_state);
  end if;
  v_hash:=rosetta_replay.closure_sha256(c.closure_prefix);
  select count(*) into v_inflight from rosetta_replay.replay_attempt a
  where a.engine_version=c.engine_version and a.rule_set_version=c.rule_set_version
    and a.closure_hash=v_hash and a.attempt_state in ('claimed','running');
  v_need:=greatest(c.queue_depth-v_inflight,0);
  if v_need=0 then
    return jsonb_build_object('phase','claim','claimed',0,'inflight',v_inflight);
  end if;
  for s in
    select r.source_registry_id,r.source_content_hash,r.source_content_id
    from rosetta_replay.replay_source_registry r
    left join lateral (
      select a.attempt_state,a.retry_seq from rosetta_replay.replay_attempt a
      where a.source_registry_id=r.source_registry_id
        and a.engine_version=c.engine_version and a.rule_set_version=c.rule_set_version
        and a.closure_hash=v_hash order by a.retry_seq desc limit 1
    ) latest on true
    where (c.closure_prefix='ctl_' or exists(
      select 1 from rosetta_replay.source_replay_expectation e
      where e.source_registry_id=r.source_registry_id))
      and not exists(select 1 from rosetta_replay.replay_run_binding b
        where b.source_registry_id=r.source_registry_id
          and b.engine_version=c.engine_version and b.rule_set_version=c.rule_set_version
          and b.closure_hash=v_hash)
      and (latest.attempt_state is null or
        (latest.attempt_state in ('timed_out','failed_retryable')
         and latest.retry_seq<c.max_retry_seq))
    order by r.source_content_hash,r.source_content_id limit v_need
  loop
    v_config:=rosetta_replay.expected_configuration_hash(s.source_registry_id);
    v_attempt:=rosetta_replay.replay_claim(
      s.source_registry_id,c.closure_prefix,c.engine_version,c.rule_set_version,
      v_config,v_hash,c.worker_identity,interval '15 minutes');
    v_claimed:=v_claimed+1;
  end loop;
  return jsonb_build_object('phase','claim','claimed',v_claimed,
    'inflight_before',v_inflight,'queue_depth',c.queue_depth);
end;
$fn$;

create or replace function rosetta_replay.replay_campaign_execute_next(p_campaign_id uuid)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare c rosetta_replay.replay_campaign%rowtype;v_hash text;v_attempt uuid;v_result jsonb;
begin
  select * into strict c from rosetta_replay.replay_campaign where campaign_id=p_campaign_id;
  if c.campaign_state<>'running' then
    return jsonb_build_object('phase','execute','processed',0,'state',c.campaign_state);
  end if;
  v_hash:=rosetta_replay.closure_sha256(c.closure_prefix);
  select a.attempt_id into v_attempt from rosetta_replay.replay_attempt a
  where a.engine_version=c.engine_version and a.rule_set_version=c.rule_set_version
    and a.closure_hash=v_hash and a.attempt_state='running' and a.pending_outcome is null
  order by a.claimed_at,a.attempt_id limit 1 for update skip locked;
  if v_attempt is null then return jsonb_build_object('phase','execute','processed',0); end if;
  v_result:=rosetta_replay.replay_execute(v_attempt,c.closure_prefix,c.timeout_ms);
  return jsonb_build_object('phase','execute','processed',1,
    'attempt_id',v_attempt,'result',v_result);
end;
$fn$;

create or replace function rosetta_replay.replay_campaign_finalize_next(p_campaign_id uuid)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare c rosetta_replay.replay_campaign%rowtype;v_hash text;v_attempt uuid;
  v_receipt uuid;v_sqlstate text;v_error text;
begin
  select * into strict c from rosetta_replay.replay_campaign where campaign_id=p_campaign_id;
  if c.campaign_state<>'running' then
    return jsonb_build_object('phase','finalize','processed',0,'state',c.campaign_state);
  end if;
  v_hash:=rosetta_replay.closure_sha256(c.closure_prefix);
  select a.attempt_id into v_attempt from rosetta_replay.replay_attempt a
  where a.engine_version=c.engine_version and a.rule_set_version=c.rule_set_version
    and a.closure_hash=v_hash and a.attempt_state='running' and a.pending_outcome is not null
  order by a.claimed_at,a.attempt_id limit 1 for update skip locked;
  if v_attempt is null then return jsonb_build_object('phase','finalize','processed',0); end if;
  begin
    v_receipt:=rosetta_replay.replay_finalize(v_attempt,c.worker_identity);
  exception when others then
    get stacked diagnostics v_sqlstate=returned_sqlstate,v_error=message_text;
    update rosetta_replay.replay_campaign set campaign_state='blocked',
      finished_at=clock_timestamp(),last_error_code=v_sqlstate,
      last_error_detail=left(v_error,4000)
    where campaign_id=p_campaign_id and campaign_state='running';
    insert into rosetta_replay.replay_campaign_event
      (campaign_id,event_kind,attempt_id,event_payload)
    values(p_campaign_id,'blocked',v_attempt,
      jsonb_build_object('sqlstate',v_sqlstate,'error',left(v_error,4000)));
    return jsonb_build_object('phase','finalize','processed',0,'blocked',true,
      'attempt_id',v_attempt,'sqlstate',v_sqlstate,'error',left(v_error,4000));
  end;
  return jsonb_build_object('phase','finalize','processed',1,
    'attempt_id',v_attempt,'receipt_id',v_receipt);
end;
$fn$;

create or replace function rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id uuid)
returns integer language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare v_ids bigint[];v_id bigint;v_removed boolean;v_count integer:=0;
begin
  select cron_job_ids into strict v_ids from rosetta_replay.replay_campaign
  where campaign_id=p_campaign_id;
  if to_regnamespace('cron') is null then return 0; end if;
  foreach v_id in array v_ids loop
    begin
      execute 'select cron.unschedule($1)' into v_removed using v_id;
      if coalesce(v_removed,false) then v_count:=v_count+1; end if;
    exception when others then null;
    end;
  end loop;
  return v_count;
end;
$fn$;

create or replace function rosetta_replay.replay_campaign_supervise(p_campaign_id uuid)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare c rosetta_replay.replay_campaign%rowtype;p jsonb;v_unscheduled integer:=0;
begin
  select * into strict c from rosetta_replay.replay_campaign
  where campaign_id=p_campaign_id for update;
  p:=rosetta_replay.replay_campaign_progress(p_campaign_id);
  if c.campaign_state='running' and (p->>'remaining_sources')::bigint=0
     and (p->>'running_attempts')::bigint=0 then
    update rosetta_replay.replay_campaign set campaign_state='completed',
      finished_at=clock_timestamp() where campaign_id=p_campaign_id;
    insert into rosetta_replay.replay_campaign_event(campaign_id,event_kind,event_payload)
    values(p_campaign_id,'completed',p);
    v_unscheduled:=rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  elsif c.campaign_state='running' and (p->>'running_attempts')::bigint=0
     and (p->>'claimable_sources')::bigint=0
     and (p->>'remaining_sources')::bigint>0 then
    update rosetta_replay.replay_campaign set campaign_state='blocked',
      finished_at=clock_timestamp(),last_error_code='P1C02',
      last_error_detail='replay exhausted retries or reached an unbound terminal attempt'
    where campaign_id=p_campaign_id;
    insert into rosetta_replay.replay_campaign_event(campaign_id,event_kind,event_payload)
    values(p_campaign_id,'blocked',p||jsonb_build_object('sqlstate','P1C02'));
    v_unscheduled:=rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  elsif c.campaign_state in ('blocked','completed','stopped') then
    v_unscheduled:=rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  end if;
  return rosetta_replay.replay_campaign_progress(p_campaign_id)
    ||jsonb_build_object('jobs_unscheduled',v_unscheduled);
end;
$fn$;

create or replace function rosetta_replay.start_replay_campaign(
    p_campaign_name text,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_worker_identity text,p_executor_count integer default 4,
    p_timeout_ms integer default 120000,p_max_retry_seq integer default 3,
    p_queue_depth integer default 16)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare v_id uuid;v_jobs bigint[]:='{}'::bigint[];v_job bigint;
  v_name text;v_command text;i integer;
begin
  if to_regnamespace('cron') is null or
     not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'pg_cron is unavailable; campaign was not started' using errcode='P1C01';
  end if;
  if p_closure_prefix not in ('ctl_','v2513_') then
    raise exception 'unsupported closure prefix %',p_closure_prefix using errcode='22023';
  end if;
  insert into rosetta_replay.replay_campaign
    (campaign_name,closure_prefix,engine_version,rule_set_version,worker_identity,
     timeout_ms,max_retry_seq,executor_count,queue_depth,campaign_state,started_at)
  values(btrim(p_campaign_name),p_closure_prefix,p_engine_version,p_rule_set_version,
    btrim(p_worker_identity),p_timeout_ms,p_max_retry_seq,p_executor_count,
    p_queue_depth,'running',clock_timestamp()) returning campaign_id into v_id;
  v_name:='rosetta-v2513-'||v_id::text||'-claim';
  v_command:=format('select rosetta_replay.replay_campaign_claim_refill(%L::uuid)',v_id::text);
  execute 'select cron.schedule($1,$2,$3)' into v_job using v_name,'5 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);
  for i in 1..p_executor_count loop
    v_name:='rosetta-v2513-'||v_id::text||'-execute-'||i::text;
    v_command:=format('select rosetta_replay.replay_campaign_execute_next(%L::uuid)',v_id::text);
    execute 'select cron.schedule($1,$2,$3)' into v_job using v_name,'5 seconds',v_command;
    v_jobs:=array_append(v_jobs,v_job);
  end loop;
  v_name:='rosetta-v2513-'||v_id::text||'-finalize';
  v_command:=format('select rosetta_replay.replay_campaign_finalize_next(%L::uuid)',v_id::text);
  execute 'select cron.schedule($1,$2,$3)' into v_job using v_name,'2 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);
  v_name:='rosetta-v2513-'||v_id::text||'-supervise';
  v_command:=format('select rosetta_replay.replay_campaign_supervise(%L::uuid)',v_id::text);
  execute 'select cron.schedule($1,$2,$3)' into v_job using v_name,'10 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);
  update rosetta_replay.replay_campaign set cron_job_ids=v_jobs where campaign_id=v_id;
  insert into rosetta_replay.replay_campaign_event(campaign_id,event_kind,event_payload)
  values(v_id,'started',jsonb_build_object('cron_job_ids',v_jobs));
  perform rosetta_replay.replay_campaign_claim_refill(v_id);
  return v_id;
end;
$fn$;

create or replace function rosetta_replay.stop_replay_campaign(
    p_campaign_id uuid,p_reason text)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay' as $fn$
declare v_unscheduled integer;
begin
  if length(btrim(coalesce(p_reason,'')))<10 then
    raise exception 'stop reason must contain at least 10 characters' using errcode='22023';
  end if;
  update rosetta_replay.replay_campaign set campaign_state='stopped',
    finished_at=coalesce(finished_at,clock_timestamp()),
    last_error_detail=left(btrim(p_reason),4000)
  where campaign_id=p_campaign_id and campaign_state in ('prepared','running');
  if found then
    insert into rosetta_replay.replay_campaign_event(campaign_id,event_kind,event_payload)
    values(p_campaign_id,'stopped',jsonb_build_object('reason',btrim(p_reason)));
  end if;
  v_unscheduled:=rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  return rosetta_replay.replay_campaign_progress(p_campaign_id)
    ||jsonb_build_object('jobs_unscheduled',v_unscheduled);
end;
$fn$;

alter table rosetta_replay.replay_campaign enable row level security;
alter table rosetta_replay.replay_campaign_event enable row level security;
revoke all on table rosetta_replay.replay_campaign from public,anon,authenticated,service_role;
revoke all on table rosetta_replay.replay_campaign_event from public,anon,authenticated,service_role;
revoke all on sequence rosetta_replay.replay_campaign_event_event_id_seq
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.reject_campaign_event_mutation() from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_progress(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_claim_refill(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_execute_next(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_finalize_next(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_unschedule_jobs(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_supervise(uuid) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.start_replay_campaign(text,text,text,text,text,integer,integer,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.stop_replay_campaign(uuid,text) from public,anon,authenticated,service_role;
