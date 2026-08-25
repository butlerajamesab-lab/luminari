-- ============================================================================
-- Migration 12 -- replay runner with enforced transaction separation and an
-- exact source -> attempt -> run -> output binding.
--
-- SQL functions cannot commit.  Consequently there is deliberately no
-- working replay_one/replay_manifest SQL shortcut.  A worker MUST call:
--   TX B replay_claim; TX C replay_execute or replay_defer; TX D replay_finalize.
-- tools/replay_manifest_worker.py is the reference transaction orchestrator.
-- ============================================================================

create or replace function rosetta_replay.closure_sha256(p_closure_prefix text)
returns text language plpgsql stable
set search_path to 'pg_catalog', 'extensions'
as $fn$
declare v_hash text;
begin
  if p_closure_prefix !~ '^(ctl_|c[1-7]_|v2513_)$' then
    raise exception 'invalid closure prefix: %',p_closure_prefix using errcode='22023';
  end if;
  select encode(extensions.digest(convert_to(coalesce(string_agg(
           pg_get_functiondef(p.oid),chr(10) order by p.proname,
           pg_get_function_identity_arguments(p.oid)),''),'UTF8'),'sha256'),'hex')
    into v_hash
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='rosetta_v2513'
    and p.proname like replace(p_closure_prefix,'_','\_') || '%' escape '\';
  if v_hash = encode(extensions.digest(convert_to('','UTF8'),'sha256'),'hex') then
    raise exception 'closure not installed: %',p_closure_prefix using errcode='P1R10';
  end if;
  return v_hash;
end;
$fn$;

create or replace function rosetta_replay.expected_configuration_hash(
    p_source_registry_id uuid)
returns text language plpgsql stable
set search_path to 'pg_catalog', 'rosetta_replay', 'rosetta_v2513', 'extensions'
as $fn$
declare v_hash text;
begin
  select encode(extensions.digest(convert_to(jsonb_build_object(
      'reference_date',case when c.source_metadata->>'reference_date' ~ '^\d{4}-\d{2}-\d{2}$'
                        then (c.source_metadata->>'reference_date')::date else null end,
      'text_extractor_version',coalesce(nullif(btrim(c.source_metadata->>'text_extractor_version'),''),'plain-text-1'),
      'normalization_version','rosetta-normalize-whitespace-v2',
      'parsing_projection_version','rosetta-layout-projection-v25',
      'confidence_mode','binary_exact_match_only')::text,'UTF8'),'sha256'),'hex')
    into v_hash
  from rosetta_replay.replay_source_registry r
  join rosetta_v2513.source_document_content c
    on c.source_content_id=r.source_content_id
   and c.source_content_hash=r.source_content_hash
  where r.source_registry_id=p_source_registry_id;
  if v_hash is null then
    raise exception 'registered source is not bound to exact candidate content: %',p_source_registry_id
      using errcode='P1R11';
  end if;
  return v_hash;
end;
$fn$;

create or replace function rosetta_replay.configuration_contract_sha256()
returns text language sql immutable
set search_path to 'pg_catalog','extensions'
as $fn$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'contract','rosetta-parser-configuration-v1',
    'per_source_fields',jsonb_build_array('reference_date','text_extractor_version'),
    'normalization_version','rosetta-normalize-whitespace-v2',
    'parsing_projection_version','rosetta-layout-projection-v25',
    'confidence_mode','binary_exact_match_only')::text,'UTF8'),'sha256'),'hex');
$fn$;

create table if not exists rosetta_replay.replay_run_binding (
    attempt_id           uuid primary key
        references rosetta_replay.replay_attempt(attempt_id),
    source_registry_id   uuid not null,
    source_content_id    uuid not null,
    source_document_id   integer not null,
    source_content_hash  text not null,
    extraction_run_id    integer,
    output_content_hash  text,
    engine_version       text not null,
    rule_set_version     text not null,
    rule_manifest_hash   text,
    configuration_hash   text not null,
    closure_hash         text not null,
    terminal_outcome     text not null
        check (terminal_outcome in ('completed','rejected','deferred_oversized')),
    failure_code         text,
    binding_sha256       text not null check (binding_sha256 ~ '^[0-9a-f]{64}$'),
    bound_at             timestamptz not null default clock_timestamp(),
    check ((terminal_outcome='completed' and extraction_run_id is not null
            and output_content_hash is not null and failure_code is null)
        or (terminal_outcome='rejected' and failure_code is not null)
        or (terminal_outcome='deferred_oversized' and extraction_run_id is null
            and output_content_hash is null and failure_code is null))
);

create or replace function rosetta_replay.reject_run_binding_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'replay_run_binding_is_immutable' using errcode='raise_exception';
end;
$fn$;
drop trigger if exists replay_run_binding_immutable on rosetta_replay.replay_run_binding;
create trigger replay_run_binding_immutable
before update or delete on rosetta_replay.replay_run_binding
for each row execute function rosetta_replay.reject_run_binding_mutation();

-- TX B: exact claim.  Caller-supplied identities are verified, never trusted.
create or replace function rosetta_replay.replay_claim(
    p_source_registry_id uuid,
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_config_hash text,
    p_closure_hash text,
    p_worker_identity text default null,
    p_lease interval default interval '5 minutes')
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $fn$
declare v_attempt uuid; v_state text; v_expected_config text; v_actual_closure text;
begin
  if not exists (select 1 from rosetta_replay.source_replay_expectation
                 where source_registry_id=p_source_registry_id) then
    raise exception 'source % has no immutable replay expectation',p_source_registry_id
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
  if not exists (
    select 1 from rosetta_v2513.extraction_rule_manifest m
    where m.engine_version=p_engine_version
      and m.rule_set_version=p_rule_set_version and m.is_active) then
    raise exception 'candidate engine/rule manifest is not installed and active: % / %',
      p_engine_version,p_rule_set_version using errcode='P1R15';
  end if;

  v_attempt:=rosetta_replay.claim_attempt(
    p_source_registry_id,p_engine_version,p_rule_set_version,
    p_config_hash,p_closure_hash,p_worker_identity,p_lease);
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

-- TX C alternative for a source explicitly declared deferred_oversized.
create or replace function rosetta_replay.replay_defer(
    p_attempt_id uuid,p_reason text)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare v_expected text;
begin
  select e.expected_terminal_outcome into v_expected
  from rosetta_replay.replay_attempt a
  join rosetta_replay.source_replay_expectation e using(source_registry_id)
  where a.attempt_id=p_attempt_id and a.attempt_state='running'
  for update of a;
  if not found or v_expected<>'deferred_oversized' then
    raise exception 'attempt % is not a running declared oversized deferral',p_attempt_id
      using errcode='P1R16';
  end if;
  if length(btrim(coalesce(p_reason,'')))<10 then
    raise exception 'deferred reason must contain at least 10 characters' using errcode='22023';
  end if;
  update rosetta_replay.replay_attempt
  set pending_outcome='deferred',pending_sqlstate=null,pending_error_detail=null,
      pending_payload=jsonb_build_object('reason',btrim(p_reason))
  where attempt_id=p_attempt_id;
  return jsonb_build_object('attempt_id',p_attempt_id,'pending_outcome','deferred');
end;
$fn$;

-- TX C: invoke exactly one installed closure and stage, but do not finalize.
create or replace function rosetta_replay.replay_execute(
    p_attempt_id uuid,p_closure_prefix text,p_timeout_ms integer default 120000)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  v_attempt rosetta_replay.replay_attempt%rowtype;
  v_registry rosetta_replay.replay_source_registry%rowtype;
  v_content rosetta_v2513.source_document_content%rowtype;
  v_result jsonb; v_sqlstate text; v_err text; v_outcome text;
begin
  select * into strict v_attempt from rosetta_replay.replay_attempt
  where attempt_id=p_attempt_id for update;
  if v_attempt.attempt_state<>'running' then
    raise exception 'attempt % is not running (%)',p_attempt_id,v_attempt.attempt_state
      using errcode='P1R17';
  end if;
  if v_attempt.pending_outcome is not null then
    raise exception 'attempt % already has a staged outcome',p_attempt_id using errcode='P1R18';
  end if;
  if v_attempt.closure_hash is distinct from rosetta_replay.closure_sha256(p_closure_prefix)
     or v_attempt.config_hash is distinct from
        rosetta_replay.expected_configuration_hash(v_attempt.source_registry_id) then
    raise exception 'attempt identity no longer matches closure or source configuration'
      using errcode='P1R19';
  end if;
  if (select expected_terminal_outcome from rosetta_replay.source_replay_expectation
      where source_registry_id=v_attempt.source_registry_id)='deferred_oversized' then
    raise exception 'declared oversized source must use replay_defer, not parser execution'
      using errcode='P1R20';
  end if;

  select * into strict v_registry from rosetta_replay.replay_source_registry
  where source_registry_id=v_attempt.source_registry_id;
  select * into strict v_content from rosetta_v2513.source_document_content
  where source_content_id=v_registry.source_content_id
    and source_content_hash=v_registry.source_content_hash;

  perform set_config('statement_timeout',greatest(p_timeout_ms,1)::text,true);
  begin
    execute format(
      'select rosetta_v2513.%Irun_rosetta_v3_extraction_v2511_candidate('
      'c.source_document_id,c.source_text,c.source_content_hash,c.source_url,'
      'c.source_version,c.media_type,c.source_byte_hash,c.source_provider_hash,'
      'case when c.source_metadata->>''reference_date'' ~ ''^\d{4}-\d{2}-\d{2}$'' '
      'then (c.source_metadata->>''reference_date'')::date else null end,'
      'coalesce(nullif(c.source_metadata->>''text_extractor_version'',''''),''plain-text-1''),'
      'c.source_metadata) from rosetta_v2513.source_document_content c '
      'where c.source_content_id=$1 and c.source_content_hash=$2',p_closure_prefix)
    into v_result using v_registry.source_content_id,v_registry.source_content_hash;

    if v_result is null then
      v_outcome:='terminal_failure';v_sqlstate:='P1R21';v_err:='candidate returned null';
    elsif (v_result->>'source_content_id')::uuid is distinct from v_registry.source_content_id
       or (v_result->>'source_document_id')::integer is distinct from v_content.source_document_id
       or v_result->>'source_content_hash' is distinct from v_registry.source_content_hash
       or v_result->>'engine_version' is distinct from v_attempt.engine_version
       or v_result->>'rule_set_version' is distinct from v_attempt.rule_set_version
       or v_result->>'configuration_hash' is distinct from v_attempt.config_hash then
      v_outcome:='terminal_failure';v_sqlstate:='P1R22';
      v_err:='candidate receipt identity differs from registered source or attempt';
    elsif v_result->>'run_status'='failed'
       or v_result->>'admissibility_state'='rejected' then
      v_outcome:='rejection';v_sqlstate:=coalesce(nullif(v_result->>'failure_code',''),'engine_rejected');
      v_err:=v_sqlstate;
    elsif v_result->>'run_status' in ('completed','validated')
       and v_result->>'admissibility_state'='admissible'
       and nullif(v_result->>'extraction_run_id','') is not null
       and nullif(v_result->>'output_content_hash','') is not null then
      v_outcome:='success';v_sqlstate:=null;v_err:=null;
    else
      v_outcome:='terminal_failure';v_sqlstate:='P1R23';
      v_err:='candidate returned an incomplete or unrecognized terminal receipt';
    end if;
    update rosetta_replay.replay_attempt
    set pending_outcome=v_outcome,pending_sqlstate=v_sqlstate,
        pending_error_detail=left(coalesce(v_err,''),4000),
        pending_payload=jsonb_build_object('result',v_result,'closure_prefix',p_closure_prefix)
    where attempt_id=p_attempt_id;
  exception when query_canceled then
    get stacked diagnostics v_sqlstate=returned_sqlstate,v_err=message_text;
    perform set_config('statement_timeout','0',true);
    update rosetta_replay.replay_attempt
    set pending_outcome='timeout',pending_sqlstate=v_sqlstate,
        pending_error_detail=left(coalesce(v_err,''),4000),
        pending_payload=jsonb_build_object('timeout_ms',p_timeout_ms)
    where attempt_id=p_attempt_id;
  when others then
    get stacked diagnostics v_sqlstate=returned_sqlstate,v_err=message_text;
    perform set_config('statement_timeout','0',true);
    v_outcome:=case
      when v_sqlstate='57014' then 'timeout'
      when v_sqlstate='40P01' or v_sqlstate like '08%'
        or v_sqlstate in ('55P03','55P04','53000','53100','53200','53300','53400')
        then 'retryable_failure'
      when v_sqlstate like '22%' or v_sqlstate like '23%'
        or v_sqlstate like 'P1%' or v_sqlstate='P0001' then 'rejection'
      else 'terminal_failure' end;
    update rosetta_replay.replay_attempt
    set pending_outcome=v_outcome,pending_sqlstate=v_sqlstate,
        pending_error_detail=left(coalesce(v_err,''),4000),
        pending_payload=jsonb_build_object('closure_prefix',p_closure_prefix,
          'exception_before_terminal_engine_receipt',true)
    where attempt_id=p_attempt_id;
  end;
  return jsonb_build_object('attempt_id',p_attempt_id,'pending_outcome',
    (select pending_outcome from rosetta_replay.replay_attempt where attempt_id=p_attempt_id));
exception when query_canceled then
  get stacked diagnostics v_sqlstate=returned_sqlstate,v_err=message_text;
  perform set_config('statement_timeout','0',true);
  update rosetta_replay.replay_attempt
  set pending_outcome='timeout',pending_sqlstate=v_sqlstate,
      pending_error_detail=left(coalesce(v_err,''),4000),
      pending_payload=jsonb_build_object('timeout_ms',p_timeout_ms,'stage','outer')
  where attempt_id=p_attempt_id;
  return jsonb_build_object('attempt_id',p_attempt_id,'pending_outcome','timeout');
end;
$fn$;

-- TX D: verify expected outcome and exact canonical run before sealing receipt.
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
  v_binding text;v_receipt uuid;
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
  select * into strict e from rosetta_replay.source_replay_expectation
  where source_registry_id=a.source_registry_id;
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
    -- timeouts/retryable/infrastructure failures are receipted, but cannot be
    -- represented as a completed corpus member binding.
    return rosetta_replay.finalize_attempt(p_attempt_id,a.pending_outcome,
      a.pending_sqlstate,a.pending_error_detail,p_worker_identity,a.pending_payload);
  end if;

  if e.expected_terminal_outcome is distinct from v_terminal
     or (v_terminal='rejected' and e.expected_failure_code is distinct from v_failure) then
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

-- These names remain only to fail loudly.  Calling them cannot accidentally
-- create a same-transaction pseudo-proof.
create or replace function rosetta_replay.replay_one(
    p_source_registry_id uuid,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_config_hash text,p_closure_hash text,
    p_worker_identity text default null,p_timeout_ms integer default 120000)
returns uuid language plpgsql as $fn$
begin
  raise exception 'transaction_boundary_required: use replay_claim, replay_execute/replay_defer, and replay_finalize as separate committed transactions'
    using errcode='P1R30';
end;
$fn$;

create or replace function rosetta_replay.replay_manifest(
    p_manifest_id uuid,p_closure_prefix text,p_engine_version text,
    p_rule_set_version text,p_config_hash text,p_closure_hash text,
    p_worker_identity text default null)
returns jsonb language plpgsql as $fn$
begin
  raise exception 'transaction_boundary_required: use tools/replay_manifest_worker.py'
    using errcode='P1R30';
end;
$fn$;
