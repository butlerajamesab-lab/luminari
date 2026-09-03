-- ============================================================================
-- Observed outcomes only
--
-- Per-source expectations are historical evidence.  They do not select replay
-- scope, authorize a deferral, or decide whether an observed result may bind.
-- Every execution binds what actually happened; the campaign disposition
-- ledger decides pass versus nonpass from that observed evidence.
-- ============================================================================

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.candidate_generation_authorization') is null
     or to_regclass('rosetta_replay.replay_run_binding') is null then
    raise exception 'observed-outcome replay requires the global replay truth contract'
      using errcode = 'P1C05';
  end if;
end;
$preflight$;

comment on table rosetta_replay.source_replay_expectation is
  'Immutable historical expectation and prior-output metadata. Never an execution, disposition, or promotion authorization.';

create or replace function rosetta_replay.replay_campaign_source_eligible(
  p_source_registry_id uuid,
  p_closure_prefix text)
returns boolean
language plpgsql stable
set search_path to 'pg_catalog', 'rosetta_replay'
as $function$
declare
  v_closure_hash text;
begin
  if not exists (
    select 1
    from rosetta_replay.replay_source_registry source
    where source.source_registry_id = p_source_registry_id
  ) then
    return false;
  end if;

  if p_closure_prefix = 'ctl_' then
    return true;
  end if;

  if p_closure_prefix = 'v2513_' and exists (
    select 1
    from rosetta_replay.candidate_replay_authorization auth
    where auth.source_registry_id = p_source_registry_id
  ) then
    return true;
  end if;

  v_closure_hash := rosetta_replay.closure_sha256(p_closure_prefix);
  return exists (
    select 1
    from rosetta_replay.candidate_generation_authorization auth
    where auth.source_registry_id = p_source_registry_id
      and auth.closure_prefix = p_closure_prefix
      and auth.closure_hash = v_closure_hash
      and auth.authorization_scope = 'full_candidate_generation'
  );
end;
$function$;

-- TX B: claim only from immutable corpus authorization. Historical expected
-- outcomes are deliberately absent from this function.
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
       p_source_registry_id, p_closure_prefix) then
    raise exception 'source % is outside the immutable replay authorization for %',
      p_source_registry_id, p_closure_prefix using errcode = 'P1R12';
  end if;

  v_expected_config :=
    rosetta_replay.expected_configuration_hash(p_source_registry_id);
  if p_config_hash is distinct from v_expected_config then
    raise exception 'configuration hash mismatch: supplied %, expected %',
      p_config_hash, v_expected_config using errcode = 'P1R13';
  end if;

  v_actual_closure := rosetta_replay.closure_sha256(p_closure_prefix);
  if p_closure_hash is distinct from v_actual_closure then
    raise exception 'closure hash mismatch: supplied %, computed %',
      p_closure_hash, v_actual_closure using errcode = 'P1R14';
  end if;

  if not exists (
    select 1
    from rosetta_v2513.extraction_rule_manifest manifest
    where manifest.engine_version = p_engine_version
      and manifest.rule_set_version = p_rule_set_version
      and manifest.is_active
  ) then
    raise exception 'candidate engine/rule manifest is not installed and active: % / %',
      p_engine_version, p_rule_set_version using errcode = 'P1R15';
  end if;

  v_attempt := rosetta_replay.claim_attempt(
    p_source_registry_id, p_engine_version, p_rule_set_version,
    p_config_hash, p_closure_hash, p_worker_identity, p_lease);

  select attempt_state into strict v_state
  from rosetta_replay.replay_attempt
  where attempt_id = v_attempt;
  if v_state in (
    'succeeded','rejected','deferred_oversized','timed_out','failed_terminal'
  ) then
    return v_attempt;
  end if;

  insert into rosetta_replay.replay_receipt (
    attempt_id, receipt_kind, worker_identity)
  values (v_attempt, 'start', p_worker_identity);

  update rosetta_replay.replay_attempt
  set attempt_state = 'running',
      started_at = coalesce(started_at, clock_timestamp())
  where attempt_id = v_attempt;
  return v_attempt;
end;
$function$;

-- Deferral is a truthful observed nonpass. It needs a reason, not a per-source
-- expectation that pre-authorizes skipping the source.
create or replace function rosetta_replay.replay_defer(
    p_attempt_id uuid,
    p_reason text)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_attempt rosetta_replay.replay_attempt%rowtype;
  v_source_bytes bigint;
begin
  select * into strict v_attempt
  from rosetta_replay.replay_attempt
  where attempt_id = p_attempt_id
  for update;

  if v_attempt.attempt_state <> 'running'
     or v_attempt.pending_outcome is not null then
    raise exception 'attempt % is not an unstaged running attempt',p_attempt_id
      using errcode = 'P1R16';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'deferred reason must contain at least 10 characters'
      using errcode = '22023';
  end if;

  select source.source_byte_length into strict v_source_bytes
  from rosetta_replay.replay_source_registry source
  where source.source_registry_id = v_attempt.source_registry_id;

  update rosetta_replay.replay_attempt
  set pending_outcome = 'deferred',
      pending_sqlstate = null,
      pending_error_detail = null,
      pending_payload = jsonb_build_object(
        'reason', btrim(p_reason),
        'source_byte_length', v_source_bytes,
        'campaign_result', 'nonpass')
  where attempt_id = p_attempt_id;

  return jsonb_build_object(
    'attempt_id',p_attempt_id,
    'pending_outcome','deferred',
    'campaign_result','nonpass');
end;
$function$;

-- TX D: bind the observed terminal result. An old expected result is copied
-- into the receipt for audit only and is never compared as an authorization.
create or replace function rosetta_replay.replay_finalize(
    p_attempt_id uuid,
    p_worker_identity text default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  a rosetta_replay.replay_attempt%rowtype;
  r rosetta_replay.replay_source_registry%rowtype;
  c rosetta_v2513.source_document_content%rowtype;
  er rosetta_v2513.extraction_run%rowtype;
  v_result jsonb;
  v_historical_expectation jsonb;
  v_payload jsonb;
  v_run integer;
  v_terminal text;
  v_failure text;
  v_binding text;
  v_receipt uuid;
begin
  select * into strict a
  from rosetta_replay.replay_attempt
  where attempt_id = p_attempt_id
  for update;
  if a.pending_outcome is null then
    raise exception 'attempt % has no committed staged outcome',p_attempt_id
      using errcode = 'P1R24';
  end if;

  select * into strict r
  from rosetta_replay.replay_source_registry
  where source_registry_id = a.source_registry_id;
  select * into strict c
  from rosetta_v2513.source_document_content
  where source_content_id = r.source_content_id
    and source_content_hash = r.source_content_hash;

  select jsonb_build_object(
      'expected_terminal_outcome', expectation.expected_terminal_outcome,
      'expected_failure_code', expectation.expected_failure_code,
      'expectation_sha256', expectation.expectation_sha256)
    into v_historical_expectation
  from rosetta_replay.source_replay_expectation expectation
  where expectation.source_registry_id = a.source_registry_id;

  v_result := a.pending_payload->'result';
  if a.pending_outcome = 'success' then
    v_terminal := 'completed';
    v_run := nullif(v_result->>'extraction_run_id','')::integer;
    select * into er
    from rosetta_v2513.extraction_run
    where id = v_run;
    if not found
       or er.source_content_id is distinct from r.source_content_id
       or er.source_document_id is distinct from c.source_document_id
       or er.source_content_hash is distinct from r.source_content_hash
       or er.engine_version is distinct from a.engine_version
       or er.rule_set_version is distinct from a.rule_set_version
       or er.configuration_hash is distinct from a.config_hash
       or er.rule_manifest_hash is distinct from v_result->>'rule_manifest_hash'
       or er.run_status <> 'completed'
       or er.admissibility_state <> 'admissible'
       or er.output_content_hash is null
       or er.output_content_hash is distinct from v_result->>'output_content_hash' then
      raise exception 'success_source_run_binding_invalid for attempt %',p_attempt_id
        using errcode = 'P1R25';
    end if;
  elsif a.pending_outcome = 'rejection' then
    v_terminal := 'rejected';
    v_failure := coalesce(
      nullif(a.pending_sqlstate,''),
      nullif(v_result->>'failure_code',''),
      'engine_rejected');
    if nullif(v_result->>'extraction_run_id','') is not null then
      v_run := (v_result->>'extraction_run_id')::integer;
      select * into er
      from rosetta_v2513.extraction_run
      where id = v_run;
      if not found
         or er.source_content_id is distinct from r.source_content_id
         or er.source_document_id is distinct from c.source_document_id
         or er.source_content_hash is distinct from r.source_content_hash
         or er.engine_version is distinct from a.engine_version
         or er.rule_set_version is distinct from a.rule_set_version
         or er.configuration_hash is distinct from a.config_hash
         or er.run_status <> 'failed'
         or er.admissibility_state <> 'rejected' then
        raise exception 'rejection_source_run_binding_invalid for attempt %',p_attempt_id
          using errcode = 'P1R26';
      end if;
    end if;
  elsif a.pending_outcome = 'deferred' then
    v_terminal := 'deferred_oversized';
    v_run := null;
  else
    return rosetta_replay.finalize_attempt(
      p_attempt_id, a.pending_outcome, a.pending_sqlstate,
      a.pending_error_detail, p_worker_identity,
      coalesce(a.pending_payload,'{}'::jsonb)
        || jsonb_build_object(
          'observed_terminal_outcome',a.pending_outcome,
          'historical_expectation',v_historical_expectation,
          'expectation_is_advisory',true));
  end if;

  v_binding := encode(extensions.digest(convert_to(jsonb_build_object(
    'attempt_id',a.attempt_id,
    'source_registry_id',a.source_registry_id,
    'source_content_id',r.source_content_id,
    'source_document_id',c.source_document_id,
    'source_content_hash',r.source_content_hash,
    'extraction_run_id',v_run,
    'output_content_hash',
      case when v_run is null then null else er.output_content_hash end,
    'engine_version',a.engine_version,
    'rule_set_version',a.rule_set_version,
    'rule_manifest_hash',
      case when v_run is null then null else er.rule_manifest_hash end,
    'configuration_hash',a.config_hash,
    'closure_hash',a.closure_hash,
    'terminal_outcome',v_terminal,
    'failure_code',v_failure)::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.replay_run_binding (
    attempt_id,source_registry_id,source_content_id,source_document_id,
    source_content_hash,extraction_run_id,output_content_hash,engine_version,
    rule_set_version,rule_manifest_hash,configuration_hash,closure_hash,
    terminal_outcome,failure_code,binding_sha256)
  values (
    a.attempt_id,a.source_registry_id,r.source_content_id,c.source_document_id,
    r.source_content_hash,v_run,
    case when v_run is null then null else er.output_content_hash end,
    a.engine_version,a.rule_set_version,
    case when v_run is null then null else er.rule_manifest_hash end,
    a.config_hash,a.closure_hash,v_terminal,v_failure,v_binding);

  v_payload := coalesce(a.pending_payload,'{}'::jsonb)
    || jsonb_build_object(
      'binding_sha256',v_binding,
      'observed_terminal_outcome',v_terminal,
      'observed_failure_code',v_failure,
      'historical_expectation',v_historical_expectation,
      'expectation_is_advisory',true);

  v_receipt := rosetta_replay.finalize_attempt(
    p_attempt_id,
    case v_terminal
      when 'completed' then 'success'
      when 'rejected' then 'rejection'
      else 'deferred'
    end,
    case when v_terminal = 'rejected' then v_failure else null end,
    a.pending_error_detail,p_worker_identity,v_payload);
  return v_receipt;
end;
$function$;

revoke all on function
  rosetta_replay.replay_campaign_source_eligible(uuid,text),
  rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval),
  rosetta_replay.replay_defer(uuid,text),
  rosetta_replay.replay_finalize(uuid,text)
  from public, anon, authenticated, service_role;

grant execute on function
  rosetta_replay.replay_campaign_source_eligible(uuid,text),
  rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval),
  rosetta_replay.replay_defer(uuid,text),
  rosetta_replay.replay_finalize(uuid,text)
  to postgres;
