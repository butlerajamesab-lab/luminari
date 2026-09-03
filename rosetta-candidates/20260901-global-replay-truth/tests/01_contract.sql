begin;

do $test$
declare
  v_definition text;
  v_blocked boolean := false;
  v_campaign_id uuid;
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.universal_validation_requirement') is null then
    raise exception 'TEST_FAIL: global replay truth tables are missing';
  end if;

  if (select count(*)
      from rosetta_replay.universal_validation_requirement
      where engine_version='rosetta-v3-deterministic-sql-2.5.28'
        and rule_set_version=
          'rosetta-five-layer-structural-correctness-2.5.28') <> 9 then
    raise exception 'TEST_FAIL: v2528 universal validation contract is incomplete';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.replay_finalize(uuid,text)'::regprocedure)
    into v_definition;
  if position('terminal outcome differs from immutable expectation'
       in v_definition) <> 0
     or position('expectation_is_advisory' in v_definition) = 0 then
    raise exception 'TEST_FAIL: historical expectation still controls finalization';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.v2528_snapshot_publication_gate(uuid,uuid)'::regprocedure)
    into v_definition;
  if position('replay_campaign_promotion_gate' in v_definition) = 0
     or v_definition ~* '(Washington|B26|S1041|LegiScan)' then
    raise exception 'TEST_FAIL: v2528 gate is not global/source-agnostic';
  end if;

  if (rosetta_replay.replay_closure_no_source_identity_gate('v2528_')
        ->>'literal_source_identity_violations')::integer <> 0 then
    raise exception 'TEST_FAIL: v2528 closure contains a literal source identity';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.replay_campaign_truth_gate(uuid)'::regprocedure)
    into v_definition;
  if position('prior_admissible_noncompleted' in v_definition) = 0
     or position('timed_out_sources' in v_definition) = 0
     or position('rejected_sources' in v_definition) = 0
     or position('truthful-global-compatibility-v1' in v_definition) = 0
     or position('passed_sources' in v_definition) <> 0 then
    raise exception 'TEST_FAIL: truthful compatibility still equates candidate safety with all-source parse success';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.seal_truthful_campaign_manifest(text,uuid,uuid)'::regprocedure)
    into v_definition;
  if position('observed_not_expected' in v_definition) = 0
     or position('truthful-campaign-manifest-v1' in v_definition) = 0
     or position('observed_outcome' in v_definition) = 0 then
    raise exception 'TEST_FAIL: mixed outcomes are not sealed as observed facts';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.truthful_campaign_promotion_gate(uuid,uuid)'::regprocedure)
    into v_definition;
  if position('truthful-global-promotion-v1' in v_definition) = 0
     or position('prior_output_state = ''admissible''' in v_definition) = 0
     or position('diff.status in (''regression'',''unexplained'')' in v_definition) = 0
     or position('rejected_sources'',(truth_gate->>''rejected_sources'')' in v_definition) = 0
     or position('lock table public.extraction_run in share mode' in v_definition) = 0
     or position('current_production_engine_version' in v_definition) = 0
     or position('stale or inexact production baseline' in v_definition) = 0 then
    raise exception 'TEST_FAIL: truthful promotion does not preserve compatibility, diffs, and explicit rejections';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid =
          'rosetta_replay.replay_campaign'::regclass
      and constraint_row.conname = 'replay_campaign_state_result_check'
      and constraint_row.convalidated
  ) then
    raise exception 'TEST_FAIL: campaign state/result integrity is not enforced';
  end if;

  if exists (
    select 1
    from rosetta_replay.replay_campaign
    where campaign_state in ('completed','blocked','stopped')
      and replay_result = 'pending'
  ) then
    raise exception 'TEST_FAIL: a terminal campaign still has a pending result';
  end if;

  select campaign_id into v_campaign_id
  from rosetta_replay.replay_campaign
  order by created_at,campaign_id
  limit 1;
  if v_campaign_id is not null then
    v_blocked := false;
    begin
      update rosetta_replay.replay_campaign
      set campaign_state='stopped', replay_result='pending'
      where campaign_id=v_campaign_id;
    exception when check_violation then
      v_blocked := true;
    end;
    if not v_blocked then
      raise exception 'TEST_FAIL: stopped/pending campaign state was accepted';
    end if;
  end if;

  select pg_get_functiondef(
    'rosetta_replay.replay_campaign_finalize_next(uuid)'::regprocedure)
    into v_definition;
  if v_definition !~ 'replay_result\s*=\s*''nonpass'''
     or v_definition !~ '''replay_result''\s*,\s*''nonpass''' then
    raise exception 'TEST_FAIL: scheduler finalization does not bind blocked/nonpass';
  end if;

  select pg_get_functiondef(
    'rosetta_replay.stop_replay_campaign(uuid,text)'::regprocedure)
    into v_definition;
  if v_definition !~ 'replay_result\s*=\s*''nonpass'''
     or v_definition !~ '''replay_result''\s*,\s*''nonpass''' then
    raise exception 'TEST_FAIL: campaign stop does not bind stopped/nonpass';
  end if;

  if rosetta_replay.classify_diff(
       'bad actor','clean actor','ignored-label',
       'navigation_chrome',null) <> 'improvement_declared'
     or rosetta_replay.classify_diff(
       'present',null,null,null,null) <> 'regression' then
    raise exception 'TEST_FAIL: observed diff classification is false';
  end if;

  begin
    perform rosetta_replay.promotion_gate_check(
      gen_random_uuid(),'v2528_','engine','rules',
      repeat('a',64),repeat('b',64),'legacy');
  exception when sqlstate 'P1G22' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST_FAIL: legacy promotion gate remained active';
  end if;

  v_blocked := false;
  begin
    perform rosetta_replay.diff_member(
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'C1');
  exception when sqlstate 'P1D05' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST_FAIL: per-source correction label remained active';
  end if;

  if exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='rosetta_replay'
      and procedure.proname in (
        'replay_campaign_universal_gate',
        'replay_campaign_promotion_gate',
        'replay_campaign_truth_gate',
        'seal_truthful_campaign_manifest',
        'truthful_campaign_promotion_gate',
        'v2528_snapshot_publication_gate',
        'replay_campaign_finalize_next',
        'stop_replay_campaign')
      and procedure.proacl::text <> '{postgres=X/postgres}'
  ) then
    raise exception 'TEST_FAIL: promotion functions are executable outside postgres';
  end if;
end;
$test$;

rollback;
