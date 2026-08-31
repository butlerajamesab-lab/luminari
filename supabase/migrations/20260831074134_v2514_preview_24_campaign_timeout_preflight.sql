-- ============================================================================
-- Migration 24 -- pg_cron timeout preflight.
-- Supabase arms its platform statement_timeout before entering the executor
-- function.  SET must therefore be a preceding top-level cron statement; an
-- inner set_config cannot extend the timer of the statement already running.
-- This changes replay orchestration only.  The immutable 2.5.14 parser closure,
-- authorization identity, completed bindings, and public serving path are not
-- changed.
-- ============================================================================
create or replace function rosetta_replay.start_replay_campaign(
    p_campaign_name text,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_worker_identity text,
    p_executor_count integer default 4,p_timeout_ms integer default 120000,
    p_max_retry_seq integer default 3,p_queue_depth integer default 16)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513' as $fn$
declare
  v_id uuid;v_jobs bigint[]:='{}'::bigint[];v_job bigint;
  v_name text;v_command text;v_hash text;i integer;
begin
  if to_regnamespace('cron') is null
     or not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'pg_cron is unavailable; campaign was not started'
      using errcode='P1C01';
  end if;
  if p_closure_prefix not in ('ctl_','v2513_','v2514_') then
    raise exception 'unsupported closure prefix %',p_closure_prefix
      using errcode='22023';
  end if;
  v_hash:=rosetta_replay.closure_sha256(p_closure_prefix);
  if not exists(
    select 1 from rosetta_v2513.extraction_rule_manifest m
    where m.engine_version=p_engine_version
      and m.rule_set_version=p_rule_set_version and m.is_active
  ) then
    raise exception 'campaign engine/rule manifest is not installed and active'
      using errcode='P1R15';
  end if;
  if p_closure_prefix='v2514_' and exists(
    select 1 from rosetta_replay.replay_source_registry r
    where not rosetta_replay.candidate_generation_is_authorized(
      r.source_registry_id,p_closure_prefix,p_engine_version,
      p_rule_set_version,v_hash)
  ) then
    raise exception '2.5.14 full-corpus campaign lacks exact authorization for one or more registered sources'
      using errcode='P1R12';
  end if;

  insert into rosetta_replay.replay_campaign
    (campaign_name,closure_prefix,engine_version,rule_set_version,
     worker_identity,timeout_ms,max_retry_seq,executor_count,queue_depth,
     campaign_state,started_at)
  values(
    btrim(p_campaign_name),p_closure_prefix,p_engine_version,
    p_rule_set_version,btrim(p_worker_identity),p_timeout_ms,p_max_retry_seq,
    p_executor_count,p_queue_depth,'running',clock_timestamp())
  returning campaign_id into v_id;

  v_name:='rosetta-'||rtrim(p_closure_prefix,'_')||'-'||v_id::text||'-claim';
  v_command:=format(
    'select rosetta_replay.replay_campaign_claim_refill(%L::uuid)',
    v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'5 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);

  for i in 1..p_executor_count loop
    v_name:='rosetta-'||rtrim(p_closure_prefix,'_')||'-'||v_id::text
      ||'-execute-'||i::text;
    v_command:=format(
      'set statement_timeout = %L; select rosetta_replay.replay_campaign_execute_next(%L::uuid)',
      p_timeout_ms::text || 'ms',v_id::text);
    execute 'select cron.schedule($1,$2,$3)'
      into v_job using v_name,'5 seconds',v_command;
    v_jobs:=array_append(v_jobs,v_job);
  end loop;

  v_name:='rosetta-'||rtrim(p_closure_prefix,'_')||'-'||v_id::text||'-finalize';
  v_command:=format(
    'select rosetta_replay.replay_campaign_finalize_next(%L::uuid)',
    v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'2 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);

  v_name:='rosetta-'||rtrim(p_closure_prefix,'_')||'-'||v_id::text||'-supervise';
  v_command:=format(
    'select rosetta_replay.replay_campaign_supervise(%L::uuid)',
    v_id::text);
  execute 'select cron.schedule($1,$2,$3)'
    into v_job using v_name,'10 seconds',v_command;
  v_jobs:=array_append(v_jobs,v_job);

  update rosetta_replay.replay_campaign
  set cron_job_ids=v_jobs where campaign_id=v_id;
  insert into rosetta_replay.replay_campaign_event(
    campaign_id,event_kind,event_payload)
  values(v_id,'started',jsonb_build_object(
    'cron_job_ids',v_jobs,'closure_prefix',p_closure_prefix,
    'closure_hash',v_hash,'engine_version',p_engine_version,
    'rule_set_version',p_rule_set_version,'executor_timeout_preflight',true));
  perform rosetta_replay.replay_campaign_claim_refill(v_id);
  return v_id;
end;
$fn$;

-- Repair executor commands for an already-running authorized campaign.  This
-- block is idempotent and derives every job id and timeout from its campaign.
do $block$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_job bigint;
  v_command text;
begin
  if to_regnamespace('cron') is null
     or not exists(select 1 from pg_extension where extname='pg_cron') then
    return;
  end if;
  for c in
    select * from rosetta_replay.replay_campaign
    where campaign_state='running'
    order by started_at,campaign_id
  loop
    v_command:=format(
      'set statement_timeout = %L; select rosetta_replay.replay_campaign_execute_next(%L::uuid)',
      c.timeout_ms::text || 'ms',c.campaign_id::text);
    foreach v_job in array c.cron_job_ids[2:(1+c.executor_count)]
    loop
      perform cron.alter_job(job_id:=v_job,command:=v_command);
    end loop;
  end loop;
end;
$block$;

revoke all on function rosetta_replay.start_replay_campaign(
  text,text,text,text,text,integer,integer,integer,integer)
  from public,anon,authenticated,service_role;
