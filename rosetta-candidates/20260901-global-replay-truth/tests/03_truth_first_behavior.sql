-- Truth-first quarantine-and-continue behavior proof.
--
-- Run this after migration 07 in an isolated database.  The fixture invokes
-- the combined v2528 runner for exactly one post-threshold attempt, then uses
-- synthetic terminal worker failures for every other source.  It never
-- schedules cron work, and every write (including parser output) is rolled
-- back.

begin;

create temporary table truth_first_behavior_fixture_state (
  campaign_id uuid primary key,
  member_count integer not null,
  quarantine_target integer not null,
  frozen_membership_sha256 text not null,
  active_source uuid not null,
  active_attempt uuid not null,
  synthetic_terminalized integer not null,
  execute_result jsonb,
  staged_outcome text,
  staged_sqlstate text,
  staged_error_detail text,
  staged_payload jsonb,
  staged_lease_expires_at timestamptz,
  finalize_result jsonb,
  finalize_noop_result jsonb,
  actual_disposition text,
  execute_noop_result jsonb,
  post_runner_progress jsonb,
  overdue_exercised boolean not null default false,
  overdue_source uuid,
  overdue_attempt uuid,
  overdue_supervise_result jsonb,
  supervise_result jsonb,
  supervise_second_result jsonb
) on commit drop;

do $test$
declare
  v_snapshot_id uuid;
  v_engine_version text;
  v_rule_set_version text;
  v_closure_hash text;
  v_member_count integer;
  v_warning_target integer;
  v_review_target integer;
  v_quarantine_target integer;
  v_campaign_id uuid;
  v_freeze jsonb;
  v_claim jsonb;
  v_checkpoint jsonb;
  v_progress jsonb;
  v_refill jsonb;
  v_second_refill jsonb;
  v_header rosetta_replay.replay_campaign_membership_receipt%rowtype;
  v_claimed record;
  v_round integer;
  v_terminalized integer := 0;
  v_refilled integer;
  v_expected_refill integer;
  v_changed integer;
  v_warning_count bigint;
  v_review_count bigint;
  v_pattern_sources bigint;
  v_review_pattern_sources bigint;
  v_attempt_count bigint;
  v_distinct_attempt_sources bigint;
  v_binding_count bigint;
  v_warning_payload jsonb;
  v_review_payload jsonb;
  v_quarantined_source uuid;
  v_quarantined_attempt uuid;
  v_active_source uuid;
  v_active_attempt uuid;
  v_reused_attempt uuid;
  v_mutation_blocked boolean := false;
  v_retry_blocked boolean := false;
  v_attempt_mutation_blocked boolean := false;
begin
  v_closure_hash := rosetta_replay.closure_sha256('v2528_');

  -- Select only a bounded authorization set that is itself an exact snapshot:
  -- identical count, bytes, membership digest, one authorization receipt, and
  -- complete candidate content/document bindings.  Prefer the smallest group
  -- with at least four members so one overdue staged-finalization observation
  -- can be supervised while later work remains; every choice stays bounded.
  with authorization_groups as (
    select auth.snapshot_id,
           auth.engine_version,
           auth.rule_set_version,
           auth.closure_hash,
           count(*)::integer as authorized_count,
           count(distinct auth.source_registry_id)::integer
             as distinct_source_count,
           count(distinct auth.authorization_sha256)::integer
             as authorization_variants,
           count(*) filter (
             where content_binding.exact_binding_count = 1)::integer
             as bound_source_count,
           snapshot_receipt.source_count::integer as snapshot_count,
           snapshot_receipt.source_total_bytes::bigint as snapshot_bytes,
           snapshot_receipt.source_membership_sha256
             as snapshot_membership_sha256,
           coalesce(sum(source.source_byte_length),0)::bigint
             as authorized_bytes,
           encode(extensions.digest(convert_to(coalesce(string_agg(
             concat_ws('|',source.source_content_id::text,
               source.source_content_hash,source.source_byte_length::text),
             chr(10) order by source.source_content_hash,
               source.source_content_id),''),'UTF8'),'sha256'),'hex')
             as authorized_membership_sha256
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.corpus_snapshot_receipt snapshot_receipt
      on snapshot_receipt.snapshot_id = auth.snapshot_id
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
    left join lateral (
      select count(*)::integer as exact_binding_count
      from rosetta_v2513.source_document_content content
      join rosetta_v2513.source_document document
        on document.id = content.source_document_id
      where content.source_content_id = source.source_content_id
        and content.source_content_hash = source.source_content_hash
    ) content_binding on true
    where auth.engine_version =
            'rosetta-v3-deterministic-sql-2.5.28'
      and auth.rule_set_version =
            'rosetta-five-layer-structural-correctness-2.5.28'
      and auth.closure_prefix = 'v2528_'
      and auth.closure_hash = v_closure_hash
      and auth.authorization_scope = 'full_candidate_generation'
      and snapshot_receipt.source_count between 2 and 128
      and exists (
        select 1
        from rosetta_v2513.extraction_rule_manifest manifest
        where manifest.engine_version = auth.engine_version
          and manifest.rule_set_version = auth.rule_set_version
          and manifest.is_active)
    group by auth.snapshot_id,auth.engine_version,
             auth.rule_set_version,auth.closure_hash,
             snapshot_receipt.source_count,
             snapshot_receipt.source_total_bytes,
             snapshot_receipt.source_membership_sha256
  )
  select candidate.snapshot_id,candidate.engine_version,
         candidate.rule_set_version,candidate.closure_hash,
         candidate.authorized_count
    into v_snapshot_id,v_engine_version,v_rule_set_version,
         v_closure_hash,v_member_count
  from authorization_groups candidate
  where candidate.authorized_count between 2 and 128
    and candidate.distinct_source_count = candidate.authorized_count
    and candidate.authorization_variants = 1
    and candidate.bound_source_count = candidate.authorized_count
    and candidate.authorized_count = candidate.snapshot_count
    and candidate.authorized_bytes = candidate.snapshot_bytes
    and candidate.authorized_membership_sha256 =
          candidate.snapshot_membership_sha256
  order by (candidate.authorized_count >= 4) desc,
           candidate.authorized_count,candidate.snapshot_id
  limit 1;

  if v_snapshot_id is null then
    raise exception 'TEST_FAIL: no exact v2528 candidate-generation authorization group with 2..128 members is installed';
  end if;

  -- Use the first integer population strictly above 15 percent.  It is always
  -- smaller than this bounded corpus, leaving at least one member with which
  -- to prove post-threshold refill.
  v_warning_target :=
    ceiling(v_member_count::numeric * 0.10)::integer;
  v_review_target :=
    ceiling(v_member_count::numeric * 0.15)::integer;
  v_quarantine_target :=
    floor(v_member_count::numeric * 0.15)::integer + 1;
  if v_warning_target < 1
     or v_review_target < v_warning_target
     or v_quarantine_target < v_review_target
     or v_quarantine_target >= v_member_count then
    raise exception 'TEST_FAIL: invalid bounded checkpoint targets warning %, review %, final % / %',
      v_warning_target,v_review_target,v_quarantine_target,v_member_count;
  end if;

  insert into rosetta_replay.replay_campaign (
    campaign_name,closure_prefix,engine_version,rule_set_version,
    worker_identity,timeout_ms,max_retry_seq,executor_count,queue_depth,
    campaign_state,replay_result,attempt_policy)
  values (
    'truth-first-behavior-' || left(gen_random_uuid()::text,8),
    'v2528_',v_engine_version,v_rule_set_version,
    'truth-first-behavior-test',120000,0,1,1,
    'prepared','pending','single_observation_v1')
  returning campaign_id into v_campaign_id;

  v_freeze := rosetta_replay.freeze_replay_campaign_membership(
    v_campaign_id,v_snapshot_id);
  select * into strict v_header
  from rosetta_replay.replay_campaign_membership_receipt
  where campaign_id = v_campaign_id;

  if (v_freeze->>'member_count')::integer is distinct from v_member_count
     or v_freeze->>'attempt_policy' is distinct from
          'single_observation_v1'
     or v_header.snapshot_id is distinct from v_snapshot_id
     or v_header.member_count is distinct from v_member_count
     or v_header.engine_version is distinct from v_engine_version
     or v_header.rule_set_version is distinct from v_rule_set_version
     or v_header.closure_prefix is distinct from 'v2528_'
     or v_header.closure_hash is distinct from v_closure_hash
     or rosetta_replay.verify_replay_campaign_membership(v_campaign_id)
          is distinct from true
     or (select count(*)
         from rosetta_replay.replay_campaign_member member
         where member.campaign_id = v_campaign_id) <> v_member_count
     or exists (
       select 1
       from rosetta_replay.replay_campaign_member member
       left join rosetta_replay.candidate_generation_authorization auth
         on auth.snapshot_id = v_snapshot_id
        and auth.engine_version = v_engine_version
        and auth.rule_set_version = v_rule_set_version
        and auth.closure_prefix = 'v2528_'
        and auth.closure_hash = v_closure_hash
        and auth.authorization_scope = 'full_candidate_generation'
        and auth.source_registry_id = member.source_registry_id
        and auth.authorization_sha256 = member.authorization_sha256
       where member.campaign_id = v_campaign_id
         and auth.source_registry_id is null) then
    raise exception 'TEST_FAIL: campaign membership did not freeze the exact authorization set';
  end if;

  -- The denominator receipt must reject even a no-op update once frozen.
  begin
    update rosetta_replay.replay_campaign_membership_receipt
    set member_count = member_count
    where campaign_id = v_campaign_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'replay_campaign_membership_is_immutable' then
      v_mutation_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_mutation_blocked then
    raise exception 'TEST_FAIL: frozen campaign denominator accepted mutation';
  end if;

  update rosetta_replay.replay_campaign
  set campaign_state = 'running',
      started_at = clock_timestamp()
  where campaign_id = v_campaign_id
    and campaign_state = 'prepared'
    and replay_result = 'pending';
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    raise exception 'TEST_FAIL: prepared truth-first campaign did not enter running state';
  end if;

  insert into rosetta_replay.replay_campaign_event (
    campaign_id,event_kind,event_payload)
  values (
    v_campaign_id,'started',
    jsonb_build_object(
      'behavior_fixture',true,
      'snapshot_id',v_snapshot_id,
      'member_count',v_member_count,
      'actual_runner_attempts_planned',1,
      'all_other_fixture_outcomes_synthetic',true));

  -- A terminal worker observation exercises quarantine accounting without
  -- running a parser.  A supported one-executor/one-deep queue is refilled
  -- until the synthetic batch has crossed 15 percent.
  for v_round in 1..v_quarantine_target loop
    v_claim :=
      rosetta_replay.truth_first_campaign_claim_refill(v_campaign_id);
    if (v_claim->>'claimed')::integer is distinct from 1
       or (select count(*)
           from rosetta_replay.replay_attempt attempt
           where attempt.campaign_id = v_campaign_id) <> v_round then
      raise exception 'TEST_FAIL: threshold claim round % did not add exactly one attempt: %',
        v_round,v_claim;
    end if;

    select attempt.attempt_id,attempt.source_registry_id
      into strict v_claimed
    from rosetta_replay.replay_attempt attempt
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = attempt.campaign_id
     and member.source_registry_id = attempt.source_registry_id
    left join rosetta_replay.replay_campaign_source_disposition disposition
      on disposition.campaign_id = attempt.campaign_id
     and disposition.source_registry_id = attempt.source_registry_id
    where attempt.campaign_id = v_campaign_id
      and attempt.attempt_state in ('running','failed_retryable')
      and disposition.disposition_id is null
    order by member.ordinal
    limit 1;

    if v_terminalized = 0 then
      -- A retryable infrastructure observation is nevertheless terminal for
      -- this one-observation campaign and must not create retry_seq = 1.
      perform rosetta_replay.finalize_attempt(
        v_claimed.attempt_id,
        'retryable_failure',
        '40P01',
        'rollback-only behavior fixture; parser was intentionally not executed',
        'truth-first-behavior-test',
        jsonb_build_object(
          'behavior_fixture',true,
          'parser_executed',false,
          'campaign_id',v_campaign_id));
      perform rosetta_replay.record_truth_first_disposition(
        v_campaign_id,v_claimed.source_registry_id,
        v_claimed.attempt_id,'retry_exhausted');
    else
      perform rosetta_replay.finalize_attempt(
        v_claimed.attempt_id,
        'terminal_failure',
        'P1Q99',
        'rollback-only behavior fixture; parser was intentionally not executed',
        'truth-first-behavior-test',
        jsonb_build_object(
          'behavior_fixture',true,
          'parser_executed',false,
          'campaign_id',v_campaign_id));
      perform rosetta_replay.record_truth_first_disposition(
        v_campaign_id,v_claimed.source_registry_id,
        v_claimed.attempt_id,'failed_terminal');
    end if;
    perform rosetta_replay.emit_truth_first_checkpoints(v_campaign_id);
    v_terminalized := v_terminalized + 1;
  end loop;

  if v_terminalized <> v_quarantine_target
     or (select count(*)
         from rosetta_replay.replay_campaign_source_disposition disposition
         where disposition.campaign_id = v_campaign_id
           and disposition.disposition <> 'completed') <>
          v_quarantine_target
     or (select count(*)
         from rosetta_replay.replay_campaign_source_disposition disposition
         where disposition.campaign_id = v_campaign_id
           and disposition.disposition = 'retry_exhausted') <> 1
     or (select count(*)
         from rosetta_replay.replay_campaign_source_disposition disposition
         where disposition.campaign_id = v_campaign_id
           and disposition.disposition = 'failed_terminal') <>
          v_quarantine_target - 1
     or exists (
       select 1
       from rosetta_replay.replay_campaign_source_disposition disposition
       left join rosetta_replay.replay_receipt receipt
         on receipt.receipt_id = disposition.receipt_id
       where disposition.campaign_id = v_campaign_id
         and (receipt.attempt_id is distinct from disposition.attempt_id
           or receipt.receipt_kind is distinct from case disposition.disposition
                when 'retry_exhausted' then 'retryable_failure'
                when 'failed_terminal' then 'terminal_failure'
              end
           or (receipt.receipt_payload->>'parser_executed')::boolean
                is distinct from false)) then
    raise exception 'TEST_FAIL: synthetic terminal observations were not quarantined exactly';
  end if;

  -- A dispositioned member cannot become a retry in the same campaign.
  select disposition.source_registry_id,disposition.attempt_id
    into strict v_quarantined_source,v_quarantined_attempt
  from rosetta_replay.replay_campaign_source_disposition disposition
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = disposition.campaign_id
   and member.source_registry_id = disposition.source_registry_id
  where disposition.campaign_id = v_campaign_id
  order by member.ordinal
  limit 1;
  begin
    perform rosetta_replay.replay_campaign_claim_source(
      v_campaign_id,v_quarantined_source);
  exception when sqlstate 'P1Q28' then
    v_retry_blocked := true;
  end;
  if not v_retry_blocked then
    raise exception 'TEST_FAIL: quarantined source was claimable again in the same campaign';
  end if;

  -- In particular, the legacy attempt state machine must not re-finalize the
  -- retryable observation after its truth-first disposition made it final.
  begin
    perform rosetta_replay.finalize_attempt(
      v_quarantined_attempt,'terminal_failure','P1Q99',
      'dispositioned attempt mutation probe','truth-first-behavior-test');
  exception when sqlstate 'P0001' then
    if sqlerrm = 'campaign attempt outcome is immutable after disposition' then
      v_attempt_mutation_blocked := true;
    else
      raise;
    end if;
  end;
  if not v_attempt_mutation_blocked then
    raise exception 'TEST_FAIL: dispositioned first observation was re-finalized';
  end if;

  v_checkpoint :=
    rosetta_replay.emit_truth_first_checkpoints(v_campaign_id);
  if (v_checkpoint->>'warning_reached')::boolean is distinct from true
     or (v_checkpoint->>'review_required')::boolean is distinct from true
     or (v_checkpoint->>'processing_continues')::boolean is distinct from true
     or (v_checkpoint->>'warning_event_recorded')::boolean
          is distinct from true
     or (v_checkpoint->>'review_event_recorded')::boolean
          is distinct from true then
    raise exception 'TEST_FAIL: 15 percent quarantine did not emit both continuing checkpoints: %',
      v_checkpoint;
  end if;

  -- Re-emission is intentionally idempotent; the event ledger must contain
  -- exactly one warning and one review requirement.
  perform rosetta_replay.emit_truth_first_checkpoints(v_campaign_id);
  select count(*) filter (where event_kind = 'warning_10pct'),
         count(*) filter (
           where event_kind = 'cluster_review_required_15pct')
    into v_warning_count,v_review_count
  from rosetta_replay.replay_campaign_event
  where campaign_id = v_campaign_id;
  if v_warning_count <> 1 or v_review_count <> 1 then
    raise exception 'TEST_FAIL: checkpoint events are not exactly once (warning %, review %)',
      v_warning_count,v_review_count;
  end if;

  select event_payload into strict v_warning_payload
  from rosetta_replay.replay_campaign_event
  where campaign_id = v_campaign_id
    and event_kind = 'warning_10pct';
  select event_payload into strict v_review_payload
  from rosetta_replay.replay_campaign_event
  where campaign_id = v_campaign_id
    and event_kind = 'cluster_review_required_15pct';
  select coalesce(sum(pattern.source_count),0)
    into v_pattern_sources
  from rosetta_replay.truth_first_quarantine_patterns(v_campaign_id) pattern;
  select coalesce(sum((pattern.value->>'source_count')::bigint),0)
    into v_review_pattern_sources
  from jsonb_array_elements(
    v_review_payload->'generalized_patterns') pattern;

  if (v_warning_payload->>'source_total')::integer
        is distinct from v_member_count
     or (v_warning_payload->>'quarantined_sources')::integer
        is distinct from v_warning_target
     or (v_warning_payload->>'denominator_is_frozen')::boolean
        is distinct from true
     or (v_warning_payload->>'processing_continues')::boolean
        is distinct from true
     or (v_review_payload->>'source_total')::integer
        is distinct from v_member_count
     or (v_review_payload->>'quarantined_sources')::integer
        is distinct from v_review_target
     or v_review_payload->>'review_scope'
        is distinct from 'entire_quarantine_stack'
     or (v_review_payload->>'source_specific_parser_changes_authorized')::boolean
        is distinct from false
     or (v_review_payload->>'denominator_is_frozen')::boolean
        is distinct from true
     or (v_review_payload->>'processing_continues')::boolean
        is distinct from true
     or jsonb_typeof(v_review_payload->'generalized_patterns')
        is distinct from 'array'
     or jsonb_array_length(v_review_payload->'generalized_patterns') = 0
     or v_review_pattern_sources <> v_review_target
     or v_pattern_sources <> v_quarantine_target then
    raise exception 'TEST_FAIL: checkpoint payloads do not describe the frozen whole-corpus quarantine';
  end if;

  v_progress :=
    rosetta_replay.truth_first_campaign_progress(v_campaign_id);
  if (v_progress->>'campaign_state') is distinct from 'running'
     or (v_progress->>'processing_complete')::boolean
        is distinct from false
     or (v_progress->>'processing_state') is distinct from 'in_progress'
     or (v_progress->>'source_total')::integer
        is distinct from v_member_count
     or (v_progress->>'frozen_denominator')::integer
        is distinct from v_member_count
     or (v_progress->>'accounted_sources')::integer
        is distinct from v_quarantine_target
     or (v_progress->>'unprocessed_sources')::integer
        is distinct from v_member_count - v_quarantine_target
     or (v_progress->>'quarantined_sources')::integer
        is distinct from v_quarantine_target
     or (v_progress->>'retry_exhausted_sources')::integer
        is distinct from 1
     or (v_progress->>'failed_terminal_sources')::integer
        is distinct from v_quarantine_target - 1
     or (v_progress->>'attempted_sources')::integer
        is distinct from v_quarantine_target
     or (v_progress->>'remaining_sources')::integer
        is distinct from v_member_count - v_quarantine_target
     or (v_progress->>'running_attempts')::integer is distinct from 0
     or (v_progress->>'claimable_sources')::integer
        is distinct from v_member_count - v_quarantine_target
     or (v_progress->>'terminal_orphans')::integer is distinct from 0
     or (v_progress->>'frozen_membership_sha256')
        is distinct from v_header.frozen_membership_sha256
     or (v_progress #>> '{quarantine_thresholds,warning_reached}')::boolean
        is distinct from true
     or (v_progress #>> '{quarantine_thresholds,review_required}')::boolean
        is distinct from true
     or (v_progress #>> '{quarantine_thresholds,processing_continues}')::boolean
        is distinct from true
     or (v_progress #>> '{quarantine_thresholds,quarantine_basis_points}')::integer
        is null
     or (v_progress #>> '{quarantine_thresholds,quarantine_basis_points}')::integer
        < 1500 then
    raise exception 'TEST_FAIL: progress is not based on the frozen denominator: %',
      v_progress;
  end if;

  -- Crossing either checkpoint must not stop claims.  With no in-flight work,
  -- refill should immediately claim the next queue slice from later members.
  v_expected_refill := least(
    1,v_member_count - v_quarantine_target);
  v_refill :=
    rosetta_replay.truth_first_campaign_claim_refill(v_campaign_id);
  v_refilled := (v_refill->>'claimed')::integer;
  if v_refilled is distinct from v_expected_refill or v_refilled <= 0 then
    raise exception 'TEST_FAIL: refill stopped after review threshold: %',v_refill;
  end if;

  -- Reclaiming an already-active member is idempotent and cannot create a
  -- second campaign/source attempt.
  select attempt.source_registry_id,attempt.attempt_id
    into strict v_active_source,v_active_attempt
  from rosetta_replay.replay_attempt attempt
  join rosetta_replay.replay_campaign_member member
    on member.campaign_id = attempt.campaign_id
   and member.source_registry_id = attempt.source_registry_id
  left join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = attempt.campaign_id
   and disposition.source_registry_id = attempt.source_registry_id
  where attempt.campaign_id = v_campaign_id
    and attempt.attempt_state = 'running'
    and disposition.disposition_id is null
  order by member.ordinal
  limit 1;
  v_reused_attempt := rosetta_replay.replay_campaign_claim_source(
    v_campaign_id,v_active_source);
  if v_reused_attempt is distinct from v_active_attempt then
    raise exception 'TEST_FAIL: an active campaign/source claim was not idempotent';
  end if;

  v_second_refill :=
    rosetta_replay.truth_first_campaign_claim_refill(v_campaign_id);
  if (v_second_refill->>'claimed')::integer is distinct from 0 then
    raise exception 'TEST_FAIL: a full queue generated duplicate attempts: %',
      v_second_refill;
  end if;

  perform rosetta_replay.emit_truth_first_checkpoints(v_campaign_id);
  select count(*),count(distinct attempt.source_registry_id)
    into v_attempt_count,v_distinct_attempt_sources
  from rosetta_replay.replay_attempt attempt
  where attempt.campaign_id = v_campaign_id;
  select count(*) into v_binding_count
  from rosetta_replay.replay_run_binding binding
  join rosetta_replay.replay_attempt attempt
    on attempt.attempt_id = binding.attempt_id
  where attempt.campaign_id = v_campaign_id;
  select count(*) filter (where event_kind = 'warning_10pct'),
         count(*) filter (
           where event_kind = 'cluster_review_required_15pct')
    into v_warning_count,v_review_count
  from rosetta_replay.replay_campaign_event
  where campaign_id = v_campaign_id;

  if v_attempt_count <> v_quarantine_target + v_expected_refill
     or v_distinct_attempt_sources <> v_attempt_count
     or exists (
       select 1
       from rosetta_replay.replay_attempt attempt
       where attempt.campaign_id = v_campaign_id
         and attempt.retry_seq <> 0)
     or exists (
       select 1
       from rosetta_replay.replay_attempt attempt
       where attempt.campaign_id = v_campaign_id
       group by attempt.source_registry_id
       having count(*) <> 1)
     or v_binding_count <> 0
     or v_warning_count <> 1
     or v_review_count <> 1 then
    raise exception 'TEST_FAIL: refill violated one-attempt or exactly-once checkpoint semantics';
  end if;

  v_progress :=
    rosetta_replay.truth_first_campaign_progress(v_campaign_id);
  if (v_progress->>'campaign_state') is distinct from 'running'
     or (v_progress->>'source_total')::integer
        is distinct from v_member_count
     or (v_progress->>'frozen_denominator')::integer
        is distinct from v_member_count
     or (v_progress->>'accounted_sources')::integer
        is distinct from v_quarantine_target
     or (v_progress->>'quarantined_sources')::integer
        is distinct from v_quarantine_target
     or (v_progress->>'remaining_sources')::integer
        is distinct from v_member_count - v_quarantine_target
     or (v_progress->>'attempted_sources')::integer
        is distinct from v_quarantine_target + v_expected_refill
     or (v_progress->>'running_attempts')::integer
        is distinct from v_expected_refill
     or (v_progress->>'claimable_sources')::integer
        is distinct from
          v_member_count - v_quarantine_target - v_expected_refill
     or (v_progress->>'frozen_membership_sha256')
        is distinct from v_header.frozen_membership_sha256
     or (v_progress #>> '{quarantine_thresholds,review_required}')::boolean
        is distinct from true
     or (v_progress #>> '{quarantine_thresholds,processing_continues}')::boolean
        is distinct from true then
    raise exception 'TEST_FAIL: post-threshold refill changed frozen accounting: %',
      v_progress;
  end if;

  insert into pg_temp.truth_first_behavior_fixture_state (
    campaign_id,member_count,quarantine_target,frozen_membership_sha256,
    active_source,active_attempt,synthetic_terminalized)
  values (
    v_campaign_id,v_member_count,v_quarantine_target,
    v_header.frozen_membership_sha256,v_active_source,v_active_attempt,
    v_terminalized);
end;
$test$;

-- Arm the exact campaign timeout in one statement, then invoke the combined
-- runner in the immediately following top-level statement.  Keeping execution
-- out of a DO block makes the caller-owned deadline unambiguous.
set local statement_timeout = '120s';

update pg_temp.truth_first_behavior_fixture_state fixture
set execute_result =
  rosetta_replay.truth_first_campaign_execute_next(fixture.campaign_id);

set local statement_timeout = '0';

do $assert_execute$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
  v_staged_outcome text;
  v_staged_sqlstate text;
  v_staged_error text;
  v_staged_payload jsonb;
  v_staged_lease timestamptz;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  select attempt.pending_outcome,attempt.pending_sqlstate,
         attempt.pending_error_detail,attempt.pending_payload,
         attempt.lease_expires_at
    into strict v_staged_outcome,v_staged_sqlstate,v_staged_error,
         v_staged_payload,v_staged_lease
  from rosetta_replay.replay_attempt attempt
  where attempt.attempt_id = fixture.active_attempt;

  if fixture.execute_result->>'phase' is distinct from 'execute'
     or (fixture.execute_result->>'processed')::integer is distinct from 1
     or (fixture.execute_result->>'attempt_id')::uuid
          is distinct from fixture.active_attempt
     or coalesce(
          fixture.execute_result #>> '{result,pending_outcome}',
          fixture.execute_result->>'pending_outcome')
          is distinct from v_staged_outcome
     or coalesce(
          (fixture.execute_result->>'campaign_blocked')::boolean,false)
     or v_staged_outcome is null
     or v_staged_outcome not in (
          'success','rejection','timeout',
          'retryable_failure','terminal_failure')
     or v_staged_payload->>'failure_stage' = 'preflight'
     or v_staged_payload->>'stage' = 'outer'
     or v_staged_lease is null
     or not exists (
       select 1
       from rosetta_replay.replay_attempt attempt
       where attempt.attempt_id = fixture.active_attempt
         and attempt.campaign_id = fixture.campaign_id
         and attempt.attempt_state = 'running'
         and attempt.pending_outcome is not null)
     or (select count(*)
         from rosetta_replay.replay_attempt attempt
         left join rosetta_replay.replay_campaign_source_disposition disposition
           on disposition.campaign_id = attempt.campaign_id
          and disposition.attempt_id = attempt.attempt_id
         where attempt.campaign_id = fixture.campaign_id
           and attempt.pending_outcome is not null
           and disposition.disposition_id is null) <> 1
     or (select count(*)
         from rosetta_replay.replay_attempt attempt
         where attempt.campaign_id = fixture.campaign_id) <>
          fixture.quarantine_target + 1
     or not exists (
       select 1
       from rosetta_replay.replay_campaign campaign
       where campaign.campaign_id = fixture.campaign_id
         and campaign.campaign_state = 'running'
         and campaign.replay_result = 'pending') then
    raise exception 'TEST_FAIL: top-level combined runner did not stage exactly the active attempt: %',
      fixture.execute_result;
  end if;

  update pg_temp.truth_first_behavior_fixture_state
  set staged_outcome = v_staged_outcome,
      staged_sqlstate = v_staged_sqlstate,
      staged_error_detail = v_staged_error,
      staged_payload = v_staged_payload,
      staged_lease_expires_at = v_staged_lease
  where campaign_id = fixture.campaign_id;
end;
$assert_execute$;

-- Re-entering execute-next while the committed observation awaits
-- finalization must select nothing and must not mutate the staged evidence.
set local statement_timeout = '120s';

update pg_temp.truth_first_behavior_fixture_state fixture
set execute_noop_result =
  rosetta_replay.truth_first_campaign_execute_next(fixture.campaign_id);

set local statement_timeout = '0';

do $assert_execute_noop$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  if fixture.execute_noop_result->>'phase' is distinct from 'execute'
     or (fixture.execute_noop_result->>'processed')::integer is distinct from 0
     or fixture.execute_noop_result ? 'attempt_id'
     or not exists (
       select 1
       from rosetta_replay.replay_attempt attempt
       where attempt.attempt_id = fixture.active_attempt
         and attempt.pending_outcome
               is not distinct from fixture.staged_outcome
         and attempt.pending_sqlstate
               is not distinct from fixture.staged_sqlstate
         and attempt.pending_error_detail
               is not distinct from fixture.staged_error_detail
         and attempt.pending_payload is not distinct from fixture.staged_payload
         and attempt.lease_expires_at
               is not distinct from fixture.staged_lease_expires_at)
     or not exists (
       select 1
       from rosetta_replay.replay_campaign campaign
       where campaign.campaign_id = fixture.campaign_id
         and campaign.campaign_state = 'running'
         and campaign.replay_result = 'pending') then
    raise exception 'TEST_FAIL: staged attempt was selected again or its evidence changed: %',
      fixture.execute_noop_result;
  end if;
end;
$assert_execute_noop$;

-- Finalization is a later top-level statement.  It binds the one committed
-- observation; it never invokes the candidate runner.
update pg_temp.truth_first_behavior_fixture_state fixture
set finalize_result =
  rosetta_replay.truth_first_campaign_finalize_next(fixture.campaign_id);

-- With no other staged row, finalization is also idempotent.
update pg_temp.truth_first_behavior_fixture_state fixture
set finalize_noop_result =
  rosetta_replay.truth_first_campaign_finalize_next(fixture.campaign_id);

do $assert_finalize$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
  v_disposition record;
  v_attempt rosetta_replay.replay_attempt%rowtype;
  v_progress jsonb;
  v_warning_count bigint;
  v_review_count bigint;
  v_normal_mapping boolean;
  v_finalize_fallback boolean;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  if fixture.finalize_result->>'phase' is distinct from 'finalize'
     or (fixture.finalize_result->>'processed')::integer is distinct from 1
     or (fixture.finalize_result->>'attempt_id')::uuid
          is distinct from fixture.active_attempt
     or (fixture.finalize_result->>'continued')::boolean
          is distinct from true
     or coalesce(
          (fixture.finalize_result->>'campaign_blocked')::boolean,false)
     or fixture.finalize_noop_result->>'phase' is distinct from 'finalize'
     or (fixture.finalize_noop_result->>'processed')::integer
          is distinct from 0
     or fixture.finalize_noop_result ? 'attempt_id' then
    raise exception 'TEST_FAIL: top-level finalizer did not process exactly one staged attempt: first %, second %',
      fixture.finalize_result,fixture.finalize_noop_result;
  end if;

  select disposition.disposition,disposition.receipt_id,
         disposition.failure_code,receipt.receipt_kind,receipt.sqlstate,
         receipt.receipt_payload
    into strict v_disposition
  from rosetta_replay.replay_campaign_source_disposition disposition
  join rosetta_replay.replay_receipt receipt
    on receipt.receipt_id = disposition.receipt_id
   and receipt.attempt_id = disposition.attempt_id
  where disposition.campaign_id = fixture.campaign_id
    and disposition.source_registry_id = fixture.active_source
    and disposition.attempt_id = fixture.active_attempt;

  v_normal_mapping :=
    v_disposition.disposition is not distinct from
      case fixture.staged_outcome
        when 'success' then 'completed'
        when 'rejection' then 'rejected'
        when 'timeout' then 'timed_out'
        when 'retryable_failure' then 'retry_exhausted'
        when 'terminal_failure' then 'failed_terminal'
      end
    and v_disposition.receipt_payload->>'observed_terminal_outcome'
          is not distinct from case fixture.staged_outcome
            when 'success' then 'completed'
            when 'rejection' then 'rejected'
            else fixture.staged_outcome
          end;
  v_finalize_fallback :=
    v_disposition.disposition = 'failed_terminal'
    and (v_disposition.receipt_payload->>'source_local_finalize_error')::boolean
          is true
    and v_disposition.receipt_payload->>'staged_observed_outcome'
          is not distinct from fixture.staged_outcome;

  select * into strict v_attempt
  from rosetta_replay.replay_attempt attempt
  where attempt.attempt_id = fixture.active_attempt;
  select count(*) filter (where event_kind = 'warning_10pct'),
         count(*) filter (
           where event_kind = 'cluster_review_required_15pct')
    into v_warning_count,v_review_count
  from rosetta_replay.replay_campaign_event
  where campaign_id = fixture.campaign_id;
  v_progress :=
    rosetta_replay.truth_first_campaign_progress(fixture.campaign_id);

  if fixture.finalize_result->>'disposition'
        is distinct from v_disposition.disposition
     or (fixture.finalize_result->>'receipt_id')::uuid
        is distinct from v_disposition.receipt_id
     or (fixture.finalize_result->>'quarantined')::boolean
        is distinct from (v_disposition.disposition <> 'completed')
     or not (v_normal_mapping or v_finalize_fallback)
     or v_disposition.receipt_kind is distinct from
          (case v_disposition.disposition
            when 'completed' then 'success'
            when 'rejected' then 'rejection'
            when 'timed_out' then 'timeout'
            when 'retry_exhausted' then 'retryable_failure'
            when 'failed_terminal' then 'terminal_failure'
          end)
     or v_attempt.attempt_state is distinct from
          (case v_disposition.disposition
            when 'completed' then 'succeeded'
            when 'rejected' then 'rejected'
            when 'timed_out' then 'timed_out'
            when 'retry_exhausted' then 'failed_retryable'
            when 'failed_terminal' then 'failed_terminal'
          end)
     or v_attempt.pending_outcome is not null
     or v_attempt.pending_sqlstate is not null
     or v_attempt.pending_error_detail is not null
     or v_attempt.pending_payload is not null
     or (select count(*)
         from rosetta_replay.replay_campaign_event event
         where event.campaign_id = fixture.campaign_id
           and event.attempt_id = fixture.active_attempt
           and event.event_kind = 'disposition_recorded') <> 1
     or v_progress->>'campaign_state' is distinct from 'running'
     or v_progress->>'replay_result' is distinct from 'pending'
     or (v_progress->>'source_total')::integer
          is distinct from fixture.member_count
     or (v_progress->>'frozen_denominator')::integer
          is distinct from fixture.member_count
     or (v_progress->>'accounted_sources')::integer
          is distinct from fixture.quarantine_target + 1
     or (v_progress->>'remaining_sources')::integer
          is distinct from
            fixture.member_count - fixture.quarantine_target - 1
     or (v_progress->>'running_attempts')::integer is distinct from 0
     or (v_progress->>'claimable_sources')::integer
          is distinct from
            fixture.member_count - fixture.quarantine_target - 1
     or (v_progress #>> '{quarantine_thresholds,review_required}')::boolean
          is distinct from true
     or (v_progress #>> '{quarantine_thresholds,processing_continues}')::boolean
          is distinct from true
     or v_warning_count <> 1
     or v_review_count <> 1 then
    raise exception 'TEST_FAIL: staged runner result was not finalized as recognized continuing evidence: staged %, final %, progress %',
      fixture.staged_outcome,v_disposition.disposition,v_progress;
  end if;

  update pg_temp.truth_first_behavior_fixture_state
  set actual_disposition = v_disposition.disposition,
      post_runner_progress = v_progress
  where campaign_id = fixture.campaign_id;
end;
$assert_finalize$;

-- If the bounded group leaves enough work to prove continuation, stage one
-- synthetic committed observation with an expired finalization lease.  This
-- is evidence input only; no parser execution surface is called here.
do $stage_overdue$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
  v_claim jsonb;
  v_claimed record;
  v_progress jsonb;
  v_changed integer;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  if fixture.quarantine_target <= fixture.member_count - 3 then
    v_claim :=
      rosetta_replay.truth_first_campaign_claim_refill(fixture.campaign_id);
    if (v_claim->>'claimed')::integer is distinct from 1 then
      raise exception 'TEST_FAIL: overdue-finalization member was not claimable: %',
        v_claim;
    end if;

    select attempt.attempt_id,attempt.source_registry_id
      into strict v_claimed
    from rosetta_replay.replay_attempt attempt
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = attempt.campaign_id
     and member.source_registry_id = attempt.source_registry_id
    left join rosetta_replay.replay_campaign_source_disposition disposition
      on disposition.campaign_id = attempt.campaign_id
     and disposition.source_registry_id = attempt.source_registry_id
    where attempt.campaign_id = fixture.campaign_id
      and attempt.attempt_state = 'running'
      and attempt.pending_outcome is null
      and disposition.disposition_id is null
    order by member.ordinal
    limit 1;
    if v_claimed.attempt_id is not distinct from fixture.active_attempt
       or v_claimed.source_registry_id is not distinct from fixture.active_source
       or (select count(*)
           from rosetta_replay.replay_attempt attempt
           where attempt.campaign_id = fixture.campaign_id) <>
            fixture.quarantine_target + 2 then
      raise exception 'TEST_FAIL: overdue-finalization staging reused a campaign/source attempt';
    end if;

    update rosetta_replay.replay_attempt attempt
    set pending_outcome = 'retryable_failure',
        pending_sqlstate = '40P01',
        pending_error_detail =
          'rollback-only expired staged-finalization behavior fixture',
        pending_payload = jsonb_build_object(
          'behavior_fixture',true,
          'parser_executed',false,
          'parser_rerun',false,
          'campaign_id',fixture.campaign_id,
          'synthetic_staged_observation',true),
        lease_expires_at = clock_timestamp() - interval '1 second'
    where attempt.attempt_id = v_claimed.attempt_id
      and attempt.campaign_id = fixture.campaign_id
      and attempt.attempt_state = 'running'
      and attempt.pending_outcome is null;
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then
      raise exception 'TEST_FAIL: synthetic overdue observation was not staged';
    end if;

    v_progress :=
      rosetta_replay.truth_first_campaign_progress(fixture.campaign_id);
    if v_progress->>'campaign_state' is distinct from 'running'
       or (v_progress->>'accounted_sources')::integer
            is distinct from fixture.quarantine_target + 1
       or (v_progress->>'remaining_sources')::integer
            is distinct from
              fixture.member_count - fixture.quarantine_target - 1
       or (v_progress->>'running_attempts')::integer is distinct from 1
       or (v_progress->>'pending_finalize')::integer is distinct from 1
       or (v_progress->>'staged_finalize_overdue')::integer
            is distinct from 1
       or (v_progress->>'claimable_sources')::integer
            is distinct from
              fixture.member_count - fixture.quarantine_target - 2 then
      raise exception 'TEST_FAIL: synthetic overdue observation was not visible to supervision: %',
        v_progress;
    end if;

    update pg_temp.truth_first_behavior_fixture_state
    set overdue_exercised = true,
        overdue_source = v_claimed.source_registry_id,
        overdue_attempt = v_claimed.attempt_id
    where campaign_id = fixture.campaign_id;
  end if;
end;
$stage_overdue$;

-- The overdue-finalization supervisor is itself a later top-level statement.
update pg_temp.truth_first_behavior_fixture_state fixture
set overdue_supervise_result =
  rosetta_replay.truth_first_campaign_supervise(fixture.campaign_id)
where fixture.overdue_exercised;

do $finish_members$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
  v_receipt record;
  v_attempt rosetta_replay.replay_attempt%rowtype;
  v_claim jsonb;
  v_claimed record;
  v_progress jsonb;
  v_terminalized integer;
  v_warning_count bigint;
  v_review_count bigint;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  v_terminalized := fixture.synthetic_terminalized;

  if fixture.overdue_exercised then
    select disposition.disposition,disposition.failure_code,
           disposition.receipt_id,receipt.receipt_kind,receipt.sqlstate,
           receipt.error_detail,receipt.receipt_payload
      into strict v_receipt
    from rosetta_replay.replay_campaign_source_disposition disposition
    join rosetta_replay.replay_receipt receipt
      on receipt.receipt_id = disposition.receipt_id
     and receipt.attempt_id = disposition.attempt_id
    where disposition.campaign_id = fixture.campaign_id
      and disposition.source_registry_id = fixture.overdue_source
      and disposition.attempt_id = fixture.overdue_attempt;
    select * into strict v_attempt
    from rosetta_replay.replay_attempt attempt
    where attempt.attempt_id = fixture.overdue_attempt;

    if fixture.overdue_supervise_result->>'campaign_state'
          is distinct from 'running'
       or fixture.overdue_supervise_result->>'replay_result'
          is distinct from 'pending'
       or (fixture.overdue_supervise_result->>'processing_complete')::boolean
          is distinct from false
       or fixture.overdue_supervise_result->>'processing_state'
          is distinct from 'in_progress'
       or fixture.overdue_supervise_result->>'source_result'
          is distinct from 'in_progress'
       or (fixture.overdue_supervise_result->>'promotion_eligible')::boolean
          is distinct from false
       or (fixture.overdue_supervise_result->>'accounted_sources')::integer
          is distinct from fixture.quarantine_target + 2
       or (fixture.overdue_supervise_result->>'remaining_sources')::integer
          is distinct from fixture.member_count - fixture.quarantine_target - 2
       or (fixture.overdue_supervise_result->>'running_attempts')::integer
          is distinct from 0
       or (fixture.overdue_supervise_result->>'pending_finalize')::integer
          is distinct from 0
       or (fixture.overdue_supervise_result->>'staged_finalize_overdue')::integer
          is distinct from 0
       or (fixture.overdue_supervise_result->>'claimable_sources')::integer
          is distinct from fixture.member_count - fixture.quarantine_target - 2
       or (fixture.overdue_supervise_result
             #>> '{quarantine_thresholds,processing_continues}')::boolean
          is distinct from true
       or v_receipt.disposition is distinct from 'failed_terminal'
       or v_receipt.failure_code is distinct from 'P1Q43'
       or v_receipt.receipt_kind is distinct from 'terminal_failure'
       or v_receipt.sqlstate is distinct from 'P1Q43'
       or (v_receipt.receipt_payload->>'source_local_finalize_error')::boolean
          is distinct from true
       or v_receipt.receipt_payload->>'staged_observed_outcome'
          is distinct from 'retryable_failure'
       or v_receipt.receipt_payload->>'staged_sqlstate'
          is distinct from '40P01'
       or v_receipt.receipt_payload->>'staged_error_detail'
          is distinct from
            'rollback-only expired staged-finalization behavior fixture'
       or (v_receipt.receipt_payload
             #>> '{staged_payload,behavior_fixture}')::boolean
          is distinct from true
       or (v_receipt.receipt_payload
             #>> '{staged_payload,parser_executed}')::boolean
          is distinct from false
       or (v_receipt.receipt_payload
             #>> '{staged_payload,parser_rerun}')::boolean
          is distinct from false
       or v_attempt.attempt_state is distinct from 'failed_terminal'
       or v_attempt.pending_outcome is not null
       or v_attempt.pending_sqlstate is not null
       or v_attempt.pending_error_detail is not null
       or v_attempt.pending_payload is not null
       or (select count(*)
           from rosetta_replay.replay_campaign_event event
           where event.campaign_id = fixture.campaign_id
             and event.attempt_id = fixture.overdue_attempt
             and event.event_kind = 'disposition_recorded') <> 1
       or (select count(*)
           from rosetta_replay.replay_campaign_event event
           where event.campaign_id = fixture.campaign_id
             and event.attempt_id = fixture.overdue_attempt
             and event.event_kind = 'lease_expired') <> 0
       or (select count(*)
           from rosetta_replay.replay_campaign_event event
           where event.campaign_id = fixture.campaign_id
             and event.event_kind = 'completed') <> 0 then
      raise exception 'TEST_FAIL: overdue staged observation was not quarantined once while processing continued: %',
        fixture.overdue_supervise_result;
    end if;
    v_terminalized := v_terminalized + 1;
  elsif fixture.overdue_supervise_result is not null
        or fixture.overdue_source is not null
        or fixture.overdue_attempt is not null then
    raise exception 'TEST_FAIL: ineligible overdue-finalization branch retained state';
  end if;

  -- Directly terminalize every other remaining member.  The actual runner is
  -- never called in this loop.
  while v_terminalized < fixture.member_count - 1 loop
    v_claim :=
      rosetta_replay.truth_first_campaign_claim_refill(fixture.campaign_id);
    if (v_claim->>'claimed')::integer is distinct from 1 then
      raise exception 'TEST_FAIL: remaining frozen member was not claimable: %',
        v_claim;
    end if;

    select attempt.attempt_id,attempt.source_registry_id
      into strict v_claimed
    from rosetta_replay.replay_attempt attempt
    join rosetta_replay.replay_campaign_member member
      on member.campaign_id = attempt.campaign_id
     and member.source_registry_id = attempt.source_registry_id
    left join rosetta_replay.replay_campaign_source_disposition disposition
      on disposition.campaign_id = attempt.campaign_id
     and disposition.source_registry_id = attempt.source_registry_id
    where attempt.campaign_id = fixture.campaign_id
      and attempt.attempt_state = 'running'
      and attempt.pending_outcome is null
      and disposition.disposition_id is null
    order by member.ordinal
    limit 1;
    if v_claimed.attempt_id is not distinct from fixture.active_attempt
       or v_claimed.source_registry_id is not distinct from fixture.active_source
       or (select count(*)
           from rosetta_replay.replay_attempt attempt
           where attempt.campaign_id = fixture.campaign_id) <>
            v_terminalized + 2 then
      raise exception 'TEST_FAIL: synthetic completion reused a campaign/source attempt';
    end if;

    perform rosetta_replay.finalize_attempt(
      v_claimed.attempt_id,
      'terminal_failure',
      'P1Q99',
      'rollback-only behavior fixture; parser was intentionally not executed',
      'truth-first-behavior-test',
      jsonb_build_object(
        'behavior_fixture',true,
        'parser_executed',false,
        'parser_rerun',false,
        'campaign_id',fixture.campaign_id));
    perform rosetta_replay.record_truth_first_disposition(
      fixture.campaign_id,v_claimed.source_registry_id,
      v_claimed.attempt_id,'failed_terminal');
    perform rosetta_replay.emit_truth_first_checkpoints(fixture.campaign_id);
    v_terminalized := v_terminalized + 1;
  end loop;

  if v_terminalized <> fixture.member_count - 1 then
    raise exception 'TEST_FAIL: not every non-runner fixture member received a synthetic outcome';
  end if;

  perform rosetta_replay.emit_truth_first_checkpoints(fixture.campaign_id);
  select count(*) filter (where event_kind = 'warning_10pct'),
         count(*) filter (
           where event_kind = 'cluster_review_required_15pct')
    into v_warning_count,v_review_count
  from rosetta_replay.replay_campaign_event
  where campaign_id = fixture.campaign_id;
  v_progress :=
    rosetta_replay.truth_first_campaign_progress(fixture.campaign_id);
  if v_progress->>'campaign_state' is distinct from 'running'
     or v_progress->>'replay_result' is distinct from 'pending'
     or (v_progress->>'processing_complete')::boolean
          is distinct from true
     or v_progress->>'processing_state' is distinct from 'complete'
     or v_progress->>'source_result'
          is distinct from 'completed_with_quarantine'
     or (v_progress->>'promotion_eligible')::boolean
          is distinct from false
     or (v_progress->>'source_total')::integer
          is distinct from fixture.member_count
     or (v_progress->>'frozen_denominator')::integer
          is distinct from fixture.member_count
     or (v_progress->>'accounted_sources')::integer
          is distinct from fixture.member_count
     or (v_progress->>'unprocessed_sources')::integer is distinct from 0
     or (v_progress->>'attempted_sources')::integer
          is distinct from fixture.member_count
     or (v_progress->>'remaining_sources')::integer is distinct from 0
     or (v_progress->>'running_attempts')::integer is distinct from 0
     or (v_progress->>'pending_finalize')::integer is distinct from 0
     or (v_progress->>'staged_finalize_overdue')::integer is distinct from 0
     or (v_progress->>'claimable_sources')::integer is distinct from 0
     or (v_progress->>'terminal_orphans')::integer is distinct from 0
     or v_progress->>'frozen_membership_sha256'
          is distinct from fixture.frozen_membership_sha256
     or (v_progress #>> '{quarantine_thresholds,warning_reached}')::boolean
          is distinct from true
     or (v_progress #>> '{quarantine_thresholds,review_required}')::boolean
          is distinct from true
     or (v_progress #>> '{quarantine_thresholds,processing_continues}')::boolean
          is distinct from true
     or v_warning_count <> 1
     or v_review_count <> 1 then
    raise exception 'TEST_FAIL: complete frozen accounting was not ready for supervision: %',
      v_progress;
  end if;

  update pg_temp.truth_first_behavior_fixture_state
  set synthetic_terminalized = v_terminalized
  where campaign_id = fixture.campaign_id;
end;
$finish_members$;

-- Completion supervision and its idempotent repeat are separate top-level
-- statements, matching the production scheduling surface.
update pg_temp.truth_first_behavior_fixture_state fixture
set supervise_result =
  rosetta_replay.truth_first_campaign_supervise(fixture.campaign_id);

update pg_temp.truth_first_behavior_fixture_state fixture
set supervise_second_result =
  rosetta_replay.truth_first_campaign_supervise(fixture.campaign_id);

do $assert_complete$
declare
  fixture pg_temp.truth_first_behavior_fixture_state%rowtype;
  v_campaign rosetta_replay.replay_campaign%rowtype;
  v_attempt_count bigint;
  v_distinct_attempt_sources bigint;
  v_disposition_count bigint;
  v_distinct_disposition_sources bigint;
  v_binding_count bigint;
  v_expected_binding_count integer;
  v_warning_count bigint;
  v_review_count bigint;
  v_completed_count bigint;
  v_completed_payload jsonb;
begin
  select * into strict fixture
  from pg_temp.truth_first_behavior_fixture_state;
  select * into strict v_campaign
  from rosetta_replay.replay_campaign campaign
  where campaign.campaign_id = fixture.campaign_id;

  if fixture.supervise_result->>'campaign_state'
        is distinct from 'completed'
     or fixture.supervise_result->>'replay_result'
        is distinct from 'nonpass'
     or (fixture.supervise_result->>'processing_complete')::boolean
        is distinct from true
     or fixture.supervise_result->>'processing_state'
        is distinct from 'complete'
     or fixture.supervise_result->>'source_result'
        is distinct from 'completed_with_quarantine'
     or fixture.supervise_result->>'promotion_state'
        is distinct from 'not_evaluated'
     or (fixture.supervise_result->>'promotion_eligible')::boolean
        is distinct from false
     or (fixture.supervise_result->>'source_total')::integer
        is distinct from fixture.member_count
     or (fixture.supervise_result->>'frozen_denominator')::integer
        is distinct from fixture.member_count
     or (fixture.supervise_result->>'accounted_sources')::integer
        is distinct from fixture.member_count
     or (fixture.supervise_result->>'remaining_sources')::integer
        is distinct from 0
     or (fixture.supervise_result->>'running_attempts')::integer
        is distinct from 0
     or (fixture.supervise_result->>'pending_finalize')::integer
        is distinct from 0
     or (fixture.supervise_result->>'staged_finalize_overdue')::integer
        is distinct from 0
     or (fixture.supervise_result->>'claimable_sources')::integer
        is distinct from 0
     or (fixture.supervise_result->>'terminal_orphans')::integer
        is distinct from 0
     or nullif(fixture.supervise_result->>'finished_at','') is null
     or fixture.supervise_second_result->>'campaign_state'
        is distinct from 'completed'
     or fixture.supervise_second_result->>'replay_result'
        is distinct from 'nonpass'
     or (fixture.supervise_second_result->>'processing_complete')::boolean
        is distinct from true
     or fixture.supervise_second_result->>'source_result'
        is distinct from 'completed_with_quarantine'
     or (fixture.supervise_second_result->>'promotion_eligible')::boolean
        is distinct from false
     or v_campaign.campaign_state is distinct from 'completed'
     or v_campaign.replay_result is distinct from 'nonpass'
     or v_campaign.finished_at is null then
    raise exception 'TEST_FAIL: supervisor did not seal stable completed/nonpass truth: first %, second %',
      fixture.supervise_result,fixture.supervise_second_result;
  end if;

  select count(*),count(distinct attempt.source_registry_id)
    into v_attempt_count,v_distinct_attempt_sources
  from rosetta_replay.replay_attempt attempt
  where attempt.campaign_id = fixture.campaign_id;
  select count(*),count(distinct disposition.source_registry_id)
    into v_disposition_count,v_distinct_disposition_sources
  from rosetta_replay.replay_campaign_source_disposition disposition
  where disposition.campaign_id = fixture.campaign_id;
  select count(*) into v_binding_count
  from rosetta_replay.replay_run_binding binding
  join rosetta_replay.replay_attempt attempt
    on attempt.attempt_id = binding.attempt_id
  where attempt.campaign_id = fixture.campaign_id;
  v_expected_binding_count := case
    when fixture.actual_disposition in (
      'completed','rejected','deferred_oversized') then 1
    else 0
  end;
  select count(*) filter (where event_kind = 'warning_10pct'),
         count(*) filter (
           where event_kind = 'cluster_review_required_15pct'),
         count(*) filter (where event_kind = 'completed')
    into v_warning_count,v_review_count,v_completed_count
  from rosetta_replay.replay_campaign_event
  where campaign_id = fixture.campaign_id;

  if fixture.synthetic_terminalized <> fixture.member_count - 1
     or v_attempt_count <> fixture.member_count
     or v_distinct_attempt_sources <> fixture.member_count
     or v_disposition_count <> fixture.member_count
     or v_distinct_disposition_sources <> fixture.member_count
     or v_binding_count <> v_expected_binding_count
     or exists (
       select 1
       from rosetta_replay.replay_campaign_member member
       left join rosetta_replay.replay_attempt attempt
         on attempt.campaign_id = member.campaign_id
        and attempt.source_registry_id = member.source_registry_id
       left join rosetta_replay.replay_campaign_source_disposition disposition
         on disposition.campaign_id = member.campaign_id
        and disposition.source_registry_id = member.source_registry_id
       where member.campaign_id = fixture.campaign_id
         and (attempt.attempt_id is null
           or attempt.retry_seq <> 0
           or disposition.disposition_id is null
           or disposition.attempt_id is distinct from attempt.attempt_id))
     or exists (
       select 1
       from rosetta_replay.replay_attempt attempt
       where attempt.campaign_id = fixture.campaign_id
       group by attempt.source_registry_id
       having count(*) <> 1)
     or exists (
       select 1
       from rosetta_replay.replay_run_binding binding
       join rosetta_replay.replay_attempt attempt
         on attempt.attempt_id = binding.attempt_id
       where attempt.campaign_id = fixture.campaign_id
         and attempt.attempt_id is distinct from fixture.active_attempt)
     or (select count(*)
         from rosetta_replay.replay_campaign_source_disposition disposition
         join rosetta_replay.replay_receipt receipt
           on receipt.receipt_id = disposition.receipt_id
          and receipt.attempt_id = disposition.attempt_id
         where disposition.campaign_id = fixture.campaign_id
           and disposition.attempt_id is distinct from fixture.active_attempt
           and coalesce(
             (receipt.receipt_payload->>'behavior_fixture')::boolean,
             (receipt.receipt_payload
               #>> '{staged_payload,behavior_fixture}')::boolean)
                is true
           and coalesce(
             (receipt.receipt_payload->>'parser_executed')::boolean,
             (receipt.receipt_payload
               #>> '{staged_payload,parser_executed}')::boolean)
                is false) <> fixture.member_count - 1
     or v_warning_count <> 1
     or v_review_count <> 1
     or v_completed_count <> 1 then
    raise exception 'TEST_FAIL: final evidence is not one observation and disposition per frozen member';
  end if;

  select event.event_payload into strict v_completed_payload
  from rosetta_replay.replay_campaign_event event
  where event.campaign_id = fixture.campaign_id
    and event.event_kind = 'completed';
  if v_completed_payload->>'campaign_state' is distinct from 'completed'
     or v_completed_payload->>'replay_result' is distinct from 'nonpass'
     or (v_completed_payload->>'processing_complete')::boolean
          is distinct from true
     or v_completed_payload->>'processing_state' is distinct from 'complete'
     or v_completed_payload->>'source_result'
          is distinct from 'completed_with_quarantine'
     or v_completed_payload->>'promotion_state'
          is distinct from 'not_evaluated'
     or (v_completed_payload->>'promotion_eligible')::boolean
          is distinct from false
     or (v_completed_payload->>'source_total')::integer
          is distinct from fixture.member_count
     or (v_completed_payload->>'frozen_denominator')::integer
          is distinct from fixture.member_count
     or (v_completed_payload->>'accounted_sources')::integer
          is distinct from fixture.member_count
     or (v_completed_payload->>'remaining_sources')::integer
          is distinct from 0 then
    raise exception 'TEST_FAIL: completed event does not state truthful nonpass completion: %',
      v_completed_payload;
  end if;
end;
$assert_complete$;

rollback;
