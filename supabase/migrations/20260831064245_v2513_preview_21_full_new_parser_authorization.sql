-- Rosetta 2.5.13: authorize the immutable live snapshot for a complete direct
-- new-parser run. Historical controls remain comparison evidence where they
-- exist; absence of a 2.5.11 run must not require recomputing the old parser.

create table if not exists rosetta_replay.candidate_replay_authorization (
    source_registry_id uuid primary key
      references rosetta_replay.replay_source_registry(source_registry_id),
    snapshot_id uuid not null
      references rosetta_replay.corpus_snapshot_receipt(snapshot_id),
    authorization_scope text not null
      check (authorization_scope='full_new_parser_run'),
    authorized_by text not null check(length(btrim(authorized_by))>=3),
    authorization_instruction text not null
      check(length(btrim(authorization_instruction))>=20),
    authorization_sha256 text not null check(authorization_sha256~'^[0-9a-f]{64}$'),
    authorized_at timestamptz not null default clock_timestamp()
);

comment on table rosetta_replay.candidate_replay_authorization is
  'Immutable, source-exact authorization to run the 2.5.13 candidate directly against a verified corpus snapshot without inventing a 2.5.11 expectation.';

create or replace function rosetta_replay.reject_candidate_authorization_mutation()
returns trigger language plpgsql set search_path to 'pg_catalog' as $fn$
begin
  raise exception 'candidate_replay_authorization_is_immutable'
    using errcode='raise_exception';
end;
$fn$;

drop trigger if exists candidate_replay_authorization_immutable
  on rosetta_replay.candidate_replay_authorization;
create trigger candidate_replay_authorization_immutable before update or delete
on rosetta_replay.candidate_replay_authorization for each row
execute function rosetta_replay.reject_candidate_authorization_mutation();

create or replace function rosetta_replay.replay_campaign_source_eligible(
    p_source_registry_id uuid,p_closure_prefix text)
returns boolean language sql stable
set search_path to 'pg_catalog','rosetta_replay' as $fn$
  select p_closure_prefix='ctl_'
    or exists(select 1 from rosetta_replay.source_replay_expectation e
      where e.source_registry_id=p_source_registry_id)
    or (p_closure_prefix='v2513_' and exists(
      select 1 from rosetta_replay.candidate_replay_authorization a
      where a.source_registry_id=p_source_registry_id))
$fn$;

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
  where rosetta_replay.replay_campaign_source_eligible(
    r.source_registry_id,c.closure_prefix);
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
    where rosetta_replay.replay_campaign_source_eligible(
      r.source_registry_id,c.closure_prefix)
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
    where rosetta_replay.replay_campaign_source_eligible(
      r.source_registry_id,c.closure_prefix)
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

create or replace function rosetta_replay.authorize_full_new_parser_snapshot(
    p_snapshot_id uuid,p_authorized_by text,p_instruction text)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions' as $fn$
declare s rosetta_replay.corpus_snapshot_receipt%rowtype;v_count integer;
  v_bytes bigint;v_hash text;v_registered integer;v_authorized integer;v_auth text;
begin
  if length(btrim(coalesce(p_authorized_by,'')))<3
     or length(btrim(coalesce(p_instruction,'')))<20 then
    raise exception 'authorizer and explicit instruction are required' using errcode='22023';
  end if;
  select * into strict s from rosetta_replay.corpus_snapshot_receipt
  where snapshot_id=p_snapshot_id;
  select count(*)::integer,
    coalesce(sum(octet_length(convert_to(source_text,'UTF8'))),0)::bigint,
    encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      source_content_id::text,source_content_hash,
      octet_length(convert_to(source_text,'UTF8'))::text),chr(10)
      order by source_content_hash,source_content_id),''),'UTF8'),'sha256'),'hex')
  into v_count,v_bytes,v_hash from rosetta_v2513.source_document_content;
  if v_count is distinct from s.source_count or v_bytes is distinct from s.source_total_bytes
     or v_hash is distinct from s.source_membership_sha256 then
    raise exception 'current private corpus differs from immutable snapshot %',p_snapshot_id
      using errcode='P1B07';
  end if;
  select count(*) into v_registered
  from rosetta_replay.replay_source_registry r
  join rosetta_v2513.source_document_content c
    on c.source_content_id=r.source_content_id
   and c.source_content_hash=r.source_content_hash
   and octet_length(convert_to(c.source_text,'UTF8'))=r.source_byte_length;
  if v_registered<>v_count then
    raise exception 'registered replay sources % differ from snapshot sources %',v_registered,v_count
      using errcode='P1B07';
  end if;
  v_auth:=encode(extensions.digest(convert_to(jsonb_build_object(
    'snapshot_id',p_snapshot_id,'source_membership_sha256',s.source_membership_sha256,
    'authorized_by',btrim(p_authorized_by),'instruction',btrim(p_instruction),
    'scope','full_new_parser_run')::text,'UTF8'),'sha256'),'hex');
  insert into rosetta_replay.candidate_replay_authorization
    (source_registry_id,snapshot_id,authorization_scope,authorized_by,
     authorization_instruction,authorization_sha256)
  select r.source_registry_id,p_snapshot_id,'full_new_parser_run',
    btrim(p_authorized_by),btrim(p_instruction),v_auth
  from rosetta_replay.replay_source_registry r
  join rosetta_v2513.source_document_content c
    on c.source_content_id=r.source_content_id
   and c.source_content_hash=r.source_content_hash
   and octet_length(convert_to(c.source_text,'UTF8'))=r.source_byte_length
  on conflict(source_registry_id) do nothing;

  select count(*) into v_authorized
  from rosetta_replay.candidate_replay_authorization a
  join rosetta_replay.replay_source_registry r
    on r.source_registry_id=a.source_registry_id
  join rosetta_v2513.source_document_content c
    on c.source_content_id=r.source_content_id
   and c.source_content_hash=r.source_content_hash
   and octet_length(convert_to(c.source_text,'UTF8'))=r.source_byte_length
  where a.snapshot_id=p_snapshot_id
    and a.authorization_scope='full_new_parser_run'
    and a.authorized_by=btrim(p_authorized_by)
    and a.authorization_instruction=btrim(p_instruction)
    and a.authorization_sha256=v_auth;
  if v_authorized<>v_count then
    raise exception 'candidate authorization covered % exact sources, expected %',
      v_authorized,v_count using errcode='P1B07';
  end if;

  return jsonb_build_object('snapshot_id',p_snapshot_id,'authorized_sources',v_authorized,
    'source_membership_sha256',s.source_membership_sha256,
    'authorization_sha256',v_auth,'scope','full_new_parser_run');
end;
$fn$;

-- Exact candidate claims may proceed without a prior expected outcome only
-- when the exact source belongs to the immutable, explicitly authorized
-- snapshot. All other lanes retain the expectation-first contract.
create or replace function rosetta_replay.replay_claim(
    p_source_registry_id uuid,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_config_hash text,p_closure_hash text,
    p_worker_identity text default null,p_lease interval default interval '5 minutes')
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513' as $fn$
declare v_attempt uuid;v_state text;v_expected_config text;v_actual_closure text;
  v_has_expectation boolean;v_candidate_authorized boolean;
begin
  select exists(select 1 from rosetta_replay.source_replay_expectation
    where source_registry_id=p_source_registry_id) into v_has_expectation;
  select exists(select 1 from rosetta_replay.candidate_replay_authorization
    where source_registry_id=p_source_registry_id) into v_candidate_authorized;
  if not v_has_expectation and not (
       (p_closure_prefix='ctl_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.11'
        and p_rule_set_version='rosetta-five-layer-structural-correctness-2.5.11')
       or
       (v_candidate_authorized and p_closure_prefix='v2513_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.13'
        and p_rule_set_version='rosetta-five-layer-structural-correctness-2.5.13')
     ) then
    raise exception 'source % has neither an immutable expectation nor exact candidate authorization',
      p_source_registry_id using errcode='P1R12';
  end if;
  if p_closure_prefix='ctl_' and (
       p_engine_version is distinct from 'rosetta-v3-deterministic-sql-2.5.11'
       or p_rule_set_version is distinct from 'rosetta-five-layer-structural-correctness-2.5.11') then
    raise exception 'control characterization requires the exact 2.5.11 engine and rule set'
      using errcode='P1R12';
  end if;
  v_expected_config:=rosetta_replay.expected_configuration_hash(p_source_registry_id);
  if p_config_hash is distinct from v_expected_config then
    raise exception 'configuration hash mismatch: supplied %, expected %',p_config_hash,v_expected_config
      using errcode='P1R13';
  end if;
  v_actual_closure:=rosetta_replay.closure_sha256(p_closure_prefix);
  if p_closure_hash is distinct from v_actual_closure then
    raise exception 'closure hash mismatch: supplied %, computed %',p_closure_hash,v_actual_closure
      using errcode='P1R14';
  end if;
  if not exists(select 1 from rosetta_v2513.extraction_rule_manifest m
    where m.engine_version=p_engine_version and m.rule_set_version=p_rule_set_version
      and m.is_active) then
    raise exception 'candidate engine/rule manifest is not installed and active: % / %',
      p_engine_version,p_rule_set_version using errcode='P1R15';
  end if;
  v_attempt:=rosetta_replay.claim_attempt(p_source_registry_id,p_engine_version,
    p_rule_set_version,p_config_hash,p_closure_hash,p_worker_identity,p_lease);
  select attempt_state into v_state from rosetta_replay.replay_attempt
  where attempt_id=v_attempt;
  if v_state in ('succeeded','rejected','deferred_oversized','timed_out','failed_terminal') then
    return v_attempt;
  end if;
  insert into rosetta_replay.replay_receipt(attempt_id,receipt_kind,worker_identity)
  values(v_attempt,'start',p_worker_identity);
  update rosetta_replay.replay_attempt
  set attempt_state='running',started_at=coalesce(started_at,clock_timestamp())
  where attempt_id=v_attempt;
  return v_attempt;
end;
$fn$;

create or replace function rosetta_replay.replay_finalize(
    p_attempt_id uuid,p_worker_identity text default null)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  a rosetta_replay.replay_attempt%rowtype;
  r rosetta_replay.replay_source_registry%rowtype;
  c rosetta_v2513.source_document_content%rowtype;
  e rosetta_replay.source_replay_expectation%rowtype;
  er rosetta_v2513.extraction_run%rowtype;
  v_result jsonb;v_run integer;v_terminal text;v_failure text;
  v_binding text;v_receipt uuid;v_has_expectation boolean;v_candidate_authorized boolean;
begin
  select * into strict a from rosetta_replay.replay_attempt
  where attempt_id=p_attempt_id for update;
  if a.pending_outcome is null then
    raise exception 'attempt % has no committed staged outcome',p_attempt_id
      using errcode='P1R24';
  end if;
  select * into strict r from rosetta_replay.replay_source_registry
  where source_registry_id=a.source_registry_id;
  select * into strict c from rosetta_v2513.source_document_content
  where source_content_id=r.source_content_id and source_content_hash=r.source_content_hash;
  select * into e from rosetta_replay.source_replay_expectation
  where source_registry_id=a.source_registry_id;
  v_has_expectation:=found;
  select exists(select 1 from rosetta_replay.candidate_replay_authorization
    where source_registry_id=a.source_registry_id) into v_candidate_authorized;
  if not v_has_expectation and not (
       (a.engine_version='rosetta-v3-deterministic-sql-2.5.11'
        and a.rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
        and a.closure_hash=rosetta_replay.closure_sha256('ctl_'))
       or
       (v_candidate_authorized
        and a.engine_version='rosetta-v3-deterministic-sql-2.5.13'
        and a.rule_set_version='rosetta-five-layer-structural-correctness-2.5.13'
        and a.closure_hash=rosetta_replay.closure_sha256('v2513_'))
     ) then
    raise exception 'expectation-free finalization lacks exact control or authorized candidate identity'
      using errcode='P1R28';
  end if;
  v_result:=a.pending_payload->'result';

  if a.pending_outcome='success' then
    v_terminal:='completed';v_run:=nullif(v_result->>'extraction_run_id','')::integer;
    select * into er from rosetta_v2513.extraction_run where id=v_run;
    if not found
       or er.source_content_id is distinct from r.source_content_id
       or er.source_document_id is distinct from c.source_document_id
       or er.source_content_hash is distinct from r.source_content_hash
       or er.engine_version is distinct from a.engine_version
       or er.rule_set_version is distinct from a.rule_set_version
       or er.configuration_hash is distinct from a.config_hash
       or er.rule_manifest_hash is distinct from v_result->>'rule_manifest_hash'
       or er.run_status<>'completed' or er.admissibility_state<>'admissible'
       or er.output_content_hash is null
       or er.output_content_hash is distinct from v_result->>'output_content_hash' then
      raise exception 'success_source_run_binding_invalid for attempt %',p_attempt_id
        using errcode='P1R25';
    end if;
  elsif a.pending_outcome='rejection' then
    v_terminal:='rejected';v_failure:=coalesce(nullif(a.pending_sqlstate,''),
      nullif(v_result->>'failure_code',''),'engine_rejected');
    if nullif(v_result->>'extraction_run_id','') is not null then
      v_run:=(v_result->>'extraction_run_id')::integer;
      select * into er from rosetta_v2513.extraction_run where id=v_run;
      if not found or er.source_content_id is distinct from r.source_content_id
         or er.source_document_id is distinct from c.source_document_id
         or er.source_content_hash is distinct from r.source_content_hash
         or er.engine_version is distinct from a.engine_version
         or er.rule_set_version is distinct from a.rule_set_version
         or er.configuration_hash is distinct from a.config_hash
         or er.run_status<>'failed' or er.admissibility_state<>'rejected' then
        raise exception 'rejection_source_run_binding_invalid for attempt %',p_attempt_id
          using errcode='P1R26';
      end if;
    end if;
  elsif a.pending_outcome='deferred' then
    v_terminal:='deferred_oversized';v_run:=null;
  else
    return rosetta_replay.finalize_attempt(p_attempt_id,a.pending_outcome,
      a.pending_sqlstate,a.pending_error_detail,p_worker_identity,a.pending_payload);
  end if;

  if v_has_expectation and (
       e.expected_terminal_outcome is distinct from v_terminal
       or (v_terminal='rejected' and e.expected_failure_code is distinct from v_failure)
     ) then
    raise exception 'terminal outcome differs from immutable expectation: expected %/%, observed %/%',
      e.expected_terminal_outcome,e.expected_failure_code,v_terminal,v_failure
      using errcode='P1R27';
  end if;

  v_binding:=encode(extensions.digest(convert_to(jsonb_build_object(
    'attempt_id',a.attempt_id,'source_registry_id',a.source_registry_id,
    'source_content_id',r.source_content_id,'source_document_id',c.source_document_id,
    'source_content_hash',r.source_content_hash,'extraction_run_id',v_run,
    'output_content_hash',case when v_run is null then null else er.output_content_hash end,
    'engine_version',a.engine_version,'rule_set_version',a.rule_set_version,
    'rule_manifest_hash',case when v_run is null then null else er.rule_manifest_hash end,
    'configuration_hash',a.config_hash,'closure_hash',a.closure_hash,
    'terminal_outcome',v_terminal,'failure_code',v_failure)::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.replay_run_binding
    (attempt_id,source_registry_id,source_content_id,source_document_id,
     source_content_hash,extraction_run_id,output_content_hash,engine_version,
     rule_set_version,rule_manifest_hash,configuration_hash,closure_hash,
     terminal_outcome,failure_code,binding_sha256)
  values(a.attempt_id,a.source_registry_id,r.source_content_id,c.source_document_id,
     r.source_content_hash,v_run,case when v_run is null then null else er.output_content_hash end,
     a.engine_version,a.rule_set_version,case when v_run is null then null else er.rule_manifest_hash end,
     a.config_hash,a.closure_hash,v_terminal,v_failure,v_binding);

  v_receipt:=rosetta_replay.finalize_attempt(p_attempt_id,
    case v_terminal when 'completed' then 'success' when 'rejected' then 'rejection'
                    else 'deferred' end,
    case when v_terminal='rejected' then v_failure else null end,
    a.pending_error_detail,p_worker_identity,
    coalesce(a.pending_payload,'{}'::jsonb)||jsonb_build_object('binding_sha256',v_binding));
  return v_receipt;
end;
$fn$;

alter table rosetta_replay.candidate_replay_authorization enable row level security;
revoke all on table rosetta_replay.candidate_replay_authorization
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.reject_candidate_authorization_mutation()
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_source_eligible(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.authorize_full_new_parser_snapshot(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_finalize(uuid,text)
  from public,anon,authenticated,service_role;
