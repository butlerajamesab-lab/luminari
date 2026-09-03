-- ============================================================================
-- Terminal campaign/result integrity
--
-- A terminal campaign may never retain the ambiguous result "pending".
-- Historical terminal campaigns predate the universal proof and are therefore
-- conservatively nonpass. Only the universal supervisor may establish pass.
-- ============================================================================

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or not exists (
       select 1
       from information_schema.columns
       where table_schema='rosetta_replay'
         and table_name='replay_campaign'
         and column_name='replay_result') then
    raise exception 'terminal campaign integrity requires the global replay truth contract'
      using errcode = 'P1C05';
  end if;
end;
$preflight$;

update rosetta_replay.replay_campaign
set replay_result = case
  when campaign_state in ('completed','blocked','stopped') then 'nonpass'
  else 'pending'
end
where replay_result is distinct from case
  when campaign_state in ('completed','blocked','stopped') then 'nonpass'
  else 'pending'
end;

alter table rosetta_replay.replay_campaign
  drop constraint if exists replay_campaign_state_result_check;
alter table rosetta_replay.replay_campaign
  add constraint replay_campaign_state_result_check
  check (
    (campaign_state in ('prepared','running') and replay_result = 'pending')
    or
    (campaign_state = 'completed' and replay_result in ('pass','nonpass'))
    or
    (campaign_state in ('blocked','stopped') and replay_result = 'nonpass')
  );

create or replace function rosetta_replay.replay_campaign_finalize_next(
  p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  v_hash text;
  v_attempt uuid;
  v_receipt uuid;
  v_sqlstate text;
  v_error text;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  if c.campaign_state <> 'running' then
    return jsonb_build_object(
      'phase','finalize','processed',0,'state',c.campaign_state,
      'replay_result',c.replay_result);
  end if;

  v_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  select attempt.attempt_id into v_attempt
  from rosetta_replay.replay_attempt attempt
  where attempt.engine_version = c.engine_version
    and attempt.rule_set_version = c.rule_set_version
    and attempt.closure_hash = v_hash
    and attempt.attempt_state = 'running'
    and attempt.pending_outcome is not null
  order by attempt.claimed_at,attempt.attempt_id
  limit 1
  for update skip locked;
  if v_attempt is null then
    return jsonb_build_object('phase','finalize','processed',0);
  end if;

  begin
    v_receipt := rosetta_replay.replay_finalize(
      v_attempt,c.worker_identity);
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_error = message_text;
    update rosetta_replay.replay_campaign
    set campaign_state = 'blocked',
        replay_result = 'nonpass',
        finished_at = clock_timestamp(),
        last_error_code = coalesce(v_sqlstate,'P1C05'),
        last_error_detail = left(coalesce(v_error,
          'campaign finalization failed'),4000)
    where campaign_id = p_campaign_id
      and campaign_state = 'running';
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,attempt_id,event_payload)
    values (
      p_campaign_id,'blocked',v_attempt,
      jsonb_build_object(
        'sqlstate',coalesce(v_sqlstate,'P1C05'),
        'error',left(coalesce(v_error,
          'campaign finalization failed'),4000),
        'replay_result','nonpass',
        'fail_closed',true));
    return jsonb_build_object(
      'phase','finalize','processed',0,'blocked',true,
      'replay_result','nonpass','attempt_id',v_attempt,
      'sqlstate',coalesce(v_sqlstate,'P1C05'),
      'error',left(coalesce(v_error,
        'campaign finalization failed'),4000));
  end;

  return jsonb_build_object(
    'phase','finalize','processed',1,
    'attempt_id',v_attempt,'receipt_id',v_receipt);
end;
$function$;

create or replace function rosetta_replay.stop_replay_campaign(
  p_campaign_id uuid,
  p_reason text)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_unscheduled integer;
begin
  if length(btrim(coalesce(p_reason,''))) < 10 then
    raise exception 'stop reason must contain at least 10 characters'
      using errcode = '22023';
  end if;

  update rosetta_replay.replay_campaign
  set campaign_state = 'stopped',
      replay_result = 'nonpass',
      finished_at = coalesce(finished_at,clock_timestamp()),
      last_error_code = null,
      last_error_detail = left(btrim(p_reason),4000)
  where campaign_id = p_campaign_id
    and campaign_state in ('prepared','running');
  if found then
    insert into rosetta_replay.replay_campaign_event (
      campaign_id,event_kind,event_payload)
    values (
      p_campaign_id,'stopped',jsonb_build_object(
        'reason',btrim(p_reason),
        'replay_result','nonpass'));
  end if;

  v_unscheduled :=
    rosetta_replay.replay_campaign_unschedule_jobs(p_campaign_id);
  return rosetta_replay.replay_campaign_progress(p_campaign_id)
    || jsonb_build_object('jobs_unscheduled',v_unscheduled);
end;
$function$;

revoke all on function
  rosetta_replay.replay_campaign_finalize_next(uuid),
  rosetta_replay.stop_replay_campaign(uuid,text)
  from public,anon,authenticated,service_role;

grant execute on function
  rosetta_replay.replay_campaign_finalize_next(uuid),
  rosetta_replay.stop_replay_campaign(uuid,text)
  to postgres;
