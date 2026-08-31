-- ============================================================================
-- Migration 30 -- exact 2.5.17 generation authorization and replay support.
-- Extends the immutable generation ledger; it does not rewrite or relabel any
-- earlier authorization, attempt, receipt, binding, or stopped campaign.
-- ============================================================================

alter table rosetta_replay.installed_closure_identity
  drop constraint if exists installed_closure_identity_closure_prefix_check;
alter table rosetta_replay.installed_closure_identity
  add constraint installed_closure_identity_closure_prefix_check
  check (closure_prefix ~ '^(ctl_|c[1-7]_|v2513_|v2514_|v2515_|v2516_|v2517_)$');

alter table rosetta_replay.replay_campaign
  drop constraint if exists replay_campaign_closure_prefix_check;
alter table rosetta_replay.replay_campaign
  add constraint replay_campaign_closure_prefix_check
  check (closure_prefix in ('ctl_','v2513_','v2514_','v2515_','v2516_','v2517_'));

alter table rosetta_replay.candidate_generation_authorization
  drop constraint if exists candidate_generation_authorization_closure_prefix_check;
alter table rosetta_replay.candidate_generation_authorization
  add constraint candidate_generation_authorization_closure_prefix_check
  check (closure_prefix in ('v2514_','v2515_','v2516_','v2517_'));

create or replace function rosetta_replay.recompute_closure_sha256(
    p_closure_prefix text)
returns text language plpgsql stable
set search_path to 'pg_catalog','extensions'
as $fn$
declare v_hash text;
begin
  if p_closure_prefix !~ '^(ctl_|c[1-7]_|v2513_|v2514_|v2515_|v2516_|v2517_)$' then
    raise exception 'invalid closure prefix: %',p_closure_prefix
      using errcode='22023';
  end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(
           pg_get_functiondef(p.oid),chr(10) order by p.proname,
           pg_get_function_identity_arguments(p.oid)),''),'UTF8'),'sha256'),'hex')
    into v_hash
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='rosetta_v2513'
    and p.proname like replace(p_closure_prefix,'_','\_') || '%' escape '\';
  if v_hash=encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex') then
    raise exception 'closure not installed: %',p_closure_prefix
      using errcode='P1R10';
  end if;
  return v_hash;
end;
$fn$;

create or replace function rosetta_replay.replay_claim(
    p_source_registry_id uuid,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_config_hash text,p_closure_hash text,
    p_worker_identity text default null,
    p_lease interval default interval '5 minutes')
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513' as $fn$
declare
  v_attempt uuid;v_state text;v_expected_config text;v_actual_closure text;
  v_has_expectation boolean;v_candidate_authorized boolean;
  v_generation_authorized boolean;
begin
  v_expected_config:=rosetta_replay.expected_configuration_hash(
    p_source_registry_id);
  if p_config_hash is distinct from v_expected_config then
    raise exception 'configuration hash mismatch: supplied %, expected %',
      p_config_hash,v_expected_config using errcode='P1R13';
  end if;
  v_actual_closure:=rosetta_replay.closure_sha256(p_closure_prefix);
  if p_closure_hash is distinct from v_actual_closure then
    raise exception 'closure hash mismatch: supplied %, computed %',
      p_closure_hash,v_actual_closure using errcode='P1R14';
  end if;

  select exists(select 1 from rosetta_replay.source_replay_expectation
    where source_registry_id=p_source_registry_id) into v_has_expectation;
  select exists(select 1 from rosetta_replay.candidate_replay_authorization
    where source_registry_id=p_source_registry_id) into v_candidate_authorized;
  v_generation_authorized:=
    rosetta_replay.candidate_generation_is_authorized(
      p_source_registry_id,p_closure_prefix,p_engine_version,
      p_rule_set_version,p_closure_hash);

  if p_closure_prefix in ('v2514_','v2515_','v2516_','v2517_')
     and not v_generation_authorized then
    raise exception 'candidate claim lacks exact generation authorization for source % / %',
      p_source_registry_id,p_closure_prefix using errcode='P1R12';
  end if;
  if not v_has_expectation and not (
       (p_closure_prefix='ctl_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.11'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.11')
       or
       (v_candidate_authorized and p_closure_prefix='v2513_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.13'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.13')
       or v_generation_authorized
     ) then
    raise exception 'source % has neither an immutable expectation nor exact candidate authorization',
      p_source_registry_id using errcode='P1R12';
  end if;
  if p_closure_prefix='ctl_' and (
       p_engine_version is distinct from
         'rosetta-v3-deterministic-sql-2.5.11'
       or p_rule_set_version is distinct from
         'rosetta-five-layer-structural-correctness-2.5.11') then
    raise exception 'control characterization requires the exact 2.5.11 engine and rule set'
      using errcode='P1R12';
  end if;
  if not exists(select 1 from rosetta_v2513.extraction_rule_manifest m
    where m.engine_version=p_engine_version
      and m.rule_set_version=p_rule_set_version and m.is_active) then
    raise exception 'candidate engine/rule manifest is not installed and active: % / %',
      p_engine_version,p_rule_set_version using errcode='P1R15';
  end if;

  v_attempt:=rosetta_replay.claim_attempt(
    p_source_registry_id,p_engine_version,p_rule_set_version,p_config_hash,
    p_closure_hash,p_worker_identity,p_lease);
  select attempt_state into v_state from rosetta_replay.replay_attempt
  where attempt_id=v_attempt;
  if v_state in (
    'succeeded','rejected','deferred_oversized','timed_out','failed_terminal'
  ) then
    return v_attempt;
  end if;
  insert into rosetta_replay.replay_receipt(
    attempt_id,receipt_kind,worker_identity)
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
  v_binding text;v_receipt uuid;v_has_expectation boolean;
  v_candidate_authorized boolean;v_generation_authorized boolean;v_generation_prefix text;
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
  where source_content_id=r.source_content_id
    and source_content_hash=r.source_content_hash;
  select * into e from rosetta_replay.source_replay_expectation
  where source_registry_id=a.source_registry_id;
  v_has_expectation:=found;
  select exists(select 1 from rosetta_replay.candidate_replay_authorization
    where source_registry_id=a.source_registry_id) into v_candidate_authorized;
  select i.closure_prefix into v_generation_prefix
  from rosetta_replay.installed_closure_identity i
  where i.closure_sha256=a.closure_hash
    and i.closure_prefix in ('v2514_','v2515_','v2516_','v2517_');
  v_generation_authorized:=v_generation_prefix is not null and
    rosetta_replay.candidate_generation_is_authorized(
      a.source_registry_id,v_generation_prefix,a.engine_version,
      a.rule_set_version,a.closure_hash);

  if v_generation_prefix is not null and not v_generation_authorized then
    raise exception 'candidate finalization lacks exact generation authorization for %',
      v_generation_prefix using errcode='P1R28';
  end if;
  if not v_has_expectation and not (
       (a.engine_version='rosetta-v3-deterministic-sql-2.5.11'
        and a.rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.11'
        and a.closure_hash=rosetta_replay.closure_sha256('ctl_'))
       or
       (v_candidate_authorized
        and a.engine_version='rosetta-v3-deterministic-sql-2.5.13'
        and a.rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.13'
        and a.closure_hash=rosetta_replay.closure_sha256('v2513_'))
       or v_generation_authorized
     ) then
    raise exception 'expectation-free finalization lacks exact control or authorized candidate identity'
      using errcode='P1R28';
  end if;
  v_result:=a.pending_payload->'result';

  if a.pending_outcome='success' then
    v_terminal:='completed';
    v_run:=nullif(v_result->>'extraction_run_id','')::integer;
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
       or er.output_content_hash is distinct from
          v_result->>'output_content_hash' then
      raise exception 'success_source_run_binding_invalid for attempt %',p_attempt_id
        using errcode='P1R25';
    end if;
  elsif a.pending_outcome='rejection' then
    v_terminal:='rejected';
    v_failure:=coalesce(nullif(a.pending_sqlstate,''),
      nullif(v_result->>'failure_code',''),'engine_rejected');
    if nullif(v_result->>'extraction_run_id','') is not null then
      v_run:=(v_result->>'extraction_run_id')::integer;
      select * into er from rosetta_v2513.extraction_run where id=v_run;
      if not found
         or er.source_content_id is distinct from r.source_content_id
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
    return rosetta_replay.finalize_attempt(
      p_attempt_id,a.pending_outcome,a.pending_sqlstate,
      a.pending_error_detail,p_worker_identity,a.pending_payload);
  end if;

  if v_has_expectation and (
       e.expected_terminal_outcome is distinct from v_terminal
       or (v_terminal='rejected'
           and e.expected_failure_code is distinct from v_failure)
     ) then
    raise exception 'terminal outcome differs from immutable expectation: expected %/%, observed %/%',
      e.expected_terminal_outcome,e.expected_failure_code,v_terminal,v_failure
      using errcode='P1R27';
  end if;

  v_binding:=encode(extensions.digest(convert_to(jsonb_build_object(
    'attempt_id',a.attempt_id,'source_registry_id',a.source_registry_id,
    'source_content_id',r.source_content_id,
    'source_document_id',c.source_document_id,
    'source_content_hash',r.source_content_hash,'extraction_run_id',v_run,
    'output_content_hash',case when v_run is null then null
      else er.output_content_hash end,
    'engine_version',a.engine_version,'rule_set_version',a.rule_set_version,
    'rule_manifest_hash',case when v_run is null then null
      else er.rule_manifest_hash end,
    'configuration_hash',a.config_hash,'closure_hash',a.closure_hash,
    'terminal_outcome',v_terminal,'failure_code',v_failure
  )::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.replay_run_binding
    (attempt_id,source_registry_id,source_content_id,source_document_id,
     source_content_hash,extraction_run_id,output_content_hash,engine_version,
     rule_set_version,rule_manifest_hash,configuration_hash,closure_hash,
     terminal_outcome,failure_code,binding_sha256)
  values(
    a.attempt_id,a.source_registry_id,r.source_content_id,c.source_document_id,
    r.source_content_hash,v_run,case when v_run is null then null
      else er.output_content_hash end,
    a.engine_version,a.rule_set_version,case when v_run is null then null
      else er.rule_manifest_hash end,
    a.config_hash,a.closure_hash,v_terminal,v_failure,v_binding);

  v_receipt:=rosetta_replay.finalize_attempt(
    p_attempt_id,
    case v_terminal when 'completed' then 'success'
      when 'rejected' then 'rejection' else 'deferred' end,
    case when v_terminal='rejected' then v_failure else null end,
    a.pending_error_detail,p_worker_identity,
    coalesce(a.pending_payload,'{}'::jsonb)
      ||jsonb_build_object('binding_sha256',v_binding));
  return v_receipt;
end;
$fn$;

insert into rosetta_replay.installed_closure_identity(
    closure_prefix,closure_sha256)
values ('v2517_',rosetta_replay.recompute_closure_sha256('v2517_'))
on conflict(closure_prefix) do nothing;

do $block$
begin
  if not exists(
    select 1 from rosetta_replay.installed_closure_identity i
    where i.closure_prefix='v2517_'
      and i.closure_sha256=rosetta_replay.recompute_closure_sha256('v2517_')
  ) then
    raise exception 'installed v2517 closure identity differs from current catalog'
      using errcode='P1R14';
  end if;
end;
$block$;

create or replace function rosetta_replay.authorize_candidate_generation_snapshot(
    p_snapshot_id uuid,p_engine_version text,p_rule_set_version text,
    p_closure_prefix text,p_authorized_by text,p_instruction text)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  s rosetta_replay.corpus_snapshot_receipt%rowtype;
  v_count integer;v_bytes bigint;v_hash text;v_registered integer;
  v_authorized integer;v_auth text;v_closure_hash text;v_manifest_hash text;
begin
  if length(btrim(coalesce(p_authorized_by,'')))<3
     or length(btrim(coalesce(p_instruction,'')))<20 then
    raise exception 'authorizer and explicit instruction are required'
      using errcode='22023';
  end if;
  if not (
       (p_closure_prefix='v2514_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.14'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.14')
       or
       (p_closure_prefix='v2515_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.15'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.15')
       or
       (p_closure_prefix='v2516_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.16'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.16')
       or
       (p_closure_prefix='v2517_'
        and p_engine_version='rosetta-v3-deterministic-sql-2.5.17'
        and p_rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.17')
     ) then
    raise exception 'authorization must name an exact supported candidate generation'
      using errcode='P1R12';
  end if;

  select m.manifest_hash into v_manifest_hash
  from rosetta_v2513.extraction_rule_manifest m
  where m.engine_version=p_engine_version
    and m.rule_set_version=p_rule_set_version
    and m.manifest_json->>'closure_prefix'=p_closure_prefix
    and m.is_active;
  if v_manifest_hash is null then
    raise exception 'candidate engine/rule/prefix manifest is not installed and active'
      using errcode='P1R15';
  end if;

  v_closure_hash:=rosetta_replay.closure_sha256(p_closure_prefix);
  if v_closure_hash is distinct from
     rosetta_replay.recompute_closure_sha256(p_closure_prefix) then
    raise exception 'captured candidate closure differs from current function catalog'
      using errcode='P1R14';
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
  if v_count is distinct from s.source_count
     or v_bytes is distinct from s.source_total_bytes
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
    raise exception 'registered replay sources % differ from snapshot sources %',
      v_registered,v_count using errcode='P1B07';
  end if;

  v_auth:=encode(extensions.digest(convert_to(jsonb_build_object(
    'snapshot_id',p_snapshot_id,
    'source_membership_sha256',s.source_membership_sha256,
    'engine_version',p_engine_version,'rule_set_version',p_rule_set_version,
    'manifest_hash',v_manifest_hash,'closure_prefix',p_closure_prefix,
    'closure_hash',v_closure_hash,'authorized_by',btrim(p_authorized_by),
    'instruction',btrim(p_instruction),
    'scope','full_candidate_generation')::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.candidate_generation_authorization
    (source_registry_id,snapshot_id,engine_version,rule_set_version,
     closure_prefix,closure_hash,authorization_scope,authorized_by,
     authorization_instruction,authorization_sha256)
  select r.source_registry_id,p_snapshot_id,p_engine_version,p_rule_set_version,
    p_closure_prefix,v_closure_hash,'full_candidate_generation',
    btrim(p_authorized_by),btrim(p_instruction),v_auth
  from rosetta_replay.replay_source_registry r
  join rosetta_v2513.source_document_content c
    on c.source_content_id=r.source_content_id
   and c.source_content_hash=r.source_content_hash
   and octet_length(convert_to(c.source_text,'UTF8'))=r.source_byte_length
  on conflict(source_registry_id,engine_version,rule_set_version,
              closure_prefix,closure_hash) do nothing;

  select count(*) into v_authorized
  from rosetta_replay.candidate_generation_authorization a
  where a.snapshot_id=p_snapshot_id
    and a.engine_version=p_engine_version
    and a.rule_set_version=p_rule_set_version
    and a.closure_prefix=p_closure_prefix
    and a.closure_hash=v_closure_hash
    and a.authorization_scope='full_candidate_generation'
    and a.authorized_by=btrim(p_authorized_by)
    and a.authorization_instruction=btrim(p_instruction)
    and a.authorization_sha256=v_auth;
  if v_authorized<>v_count then
    raise exception 'candidate generation authorization covered % exact sources, expected %',
      v_authorized,v_count using errcode='P1B07';
  end if;

  return jsonb_build_object(
    'snapshot_id',p_snapshot_id,'authorized_sources',v_authorized,
    'source_membership_sha256',s.source_membership_sha256,
    'engine_version',p_engine_version,'rule_set_version',p_rule_set_version,
    'manifest_hash',v_manifest_hash,'closure_prefix',p_closure_prefix,
    'closure_hash',v_closure_hash,'authorization_sha256',v_auth,
    'scope','full_candidate_generation');
end;
$fn$;

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
    or (p_closure_prefix in ('v2514_','v2515_','v2516_','v2517_') and exists(
      select 1 from rosetta_replay.candidate_generation_authorization a
      where a.source_registry_id=p_source_registry_id
        and a.closure_prefix=p_closure_prefix
        and a.closure_hash=rosetta_replay.closure_sha256(p_closure_prefix)))
$fn$;

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
  if p_closure_prefix not in ('ctl_','v2513_','v2514_','v2515_','v2516_','v2517_') then
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
  if p_closure_prefix in ('v2514_','v2515_','v2516_','v2517_') and exists(
    select 1 from rosetta_replay.replay_source_registry r
    where not rosetta_replay.candidate_generation_is_authorized(
      r.source_registry_id,p_closure_prefix,p_engine_version,
      p_rule_set_version,v_hash)
  ) then
    raise exception 'candidate full-corpus campaign lacks exact authorization for one or more registered sources'
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

revoke all on function rosetta_replay.recompute_closure_sha256(text)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.authorize_candidate_generation_snapshot(
  uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_campaign_source_eligible(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_claim(
  uuid,text,text,text,text,text,text,interval)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.replay_finalize(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function rosetta_replay.start_replay_campaign(
  text,text,text,text,text,integer,integer,integer,integer)
  from public,anon,authenticated,service_role;
