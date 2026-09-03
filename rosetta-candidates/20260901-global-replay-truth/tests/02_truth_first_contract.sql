begin;

do $test$
declare
  v_thresholds jsonb;
  v_definition text;
begin
  v_thresholds :=
    rosetta_replay.truth_first_quarantine_thresholds(1000,99);
  if (v_thresholds->>'warning_reached')::boolean
     or (v_thresholds->>'review_required')::boolean then
    raise exception '9.9 percent crossed a quarantine checkpoint';
  end if;

  v_thresholds :=
    rosetta_replay.truth_first_quarantine_thresholds(1000,100);
  if not (v_thresholds->>'warning_reached')::boolean
     or (v_thresholds->>'review_required')::boolean then
    raise exception '10 percent checkpoint boundary is wrong';
  end if;

  v_thresholds :=
    rosetta_replay.truth_first_quarantine_thresholds(1000,149);
  if not (v_thresholds->>'warning_reached')::boolean
     or (v_thresholds->>'review_required')::boolean then
    raise exception '14.9 percent checkpoint boundary is wrong';
  end if;

  v_thresholds :=
    rosetta_replay.truth_first_quarantine_thresholds(1000,150);
  if not (v_thresholds->>'warning_reached')::boolean
     or not (v_thresholds->>'review_required')::boolean
     or not (v_thresholds->>'processing_continues')::boolean then
    raise exception '15 percent review boundary is wrong';
  end if;

  if rosetta_replay.truth_first_cluster_token(
       'https://example.invalid/source/one','unknown') <> 'other'
     or rosetta_replay.truth_first_cluster_token(
       '123e4567-e89b-12d3-a456-426614174000','unknown') <> 'other'
     or rosetta_replay.truth_first_cluster_token(
       'Text/HTML','unknown') <> 'text_html' then
    raise exception 'generalized cluster token contract is not source-safe';
  end if;

  if rosetta_replay.truth_first_failure_code_bucket(
       'a-short-source-label') <> 'other'
     or rosetta_replay.truth_first_failure_code_bucket(
       'rosetta_v2528_post_base_failure') <> 'post_base_failure'
     or rosetta_replay.truth_first_failure_code_bucket(
       'rosetta_v2528_final_validation_failed') <>
          'final_validation_failed'
     or rosetta_replay.truth_first_failure_code_bucket('40P01') <>
          'sqlstate_transaction_rollback'
     or rosetta_replay.truth_first_failure_code_bucket('P1R22') <>
          'replay_integrity_error' then
    raise exception 'failure-code aggregation can expose identity or lose controlled patterns';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid =
        'rosetta_replay.replay_attempt'::regclass
      and constraint_row.conname = 'replay_attempt_campaign_member_fkey'
      and constraint_row.contype = 'f') then
    raise exception 'campaign attempt is not bound to frozen membership';
  end if;

  if not exists (
    select 1
    from pg_indexes index_row
    where index_row.schemaname = 'rosetta_replay'
      and index_row.indexname = 'replay_attempt_one_per_campaign_source'
      and index_row.indexdef like '%UNIQUE%') then
    raise exception 'one attempt per campaign/source is not structural';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_first_replay_execute(uuid,text,integer)'::regprocedure)
    into strict v_definition;
  if v_definition like '%source_replay_expectation%'
     or v_definition not like '%historical_expectation_is_advisory%'
     or v_definition not like '%v_stage := ''candidate_invocation''%'
     or v_definition not like '%v_stage := ''receipt_validation''%'
     or v_definition not like '%attempt.retry_seq <> 0%'
     or v_definition not like
          '%source-locked 120000 ms parser boundary%'
     or v_definition not like '%P1R22%'
     or v_definition not like '%P1R23%'
     or v_definition not like '%current_setting(''statement_timeout'')%'
     or v_definition not like '%P1Q42%'
     or replace(v_definition,' ','') like '%''stage'',''outer''%'
     or v_definition not like
          '%v2528_run_rosetta_v3_extraction_v2511_candidate%' then
    raise exception 'truth-first execution contract is incomplete or expectation-driven';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_observation_configuration_hash(uuid)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%reference_date_receipt%'
     or v_definition not like '%rosetta-normalize-whitespace-v2%'
     or v_definition not like '%rosetta-layout-projection-v25%'
     or v_definition not like '%binary_exact_match_only%' then
    raise exception 'manifest truth-observation configuration is not exact v2.5.13';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_observation_claim(uuid,uuid,text,text,text,text,text,text,interval)'::regprocedure)
    into strict v_definition;
  if v_definition like '%source_replay_expectation%'
     or v_definition like '%retry_seq + 1%'
     or v_definition not like '%verify_sealed_manifest%'
     or v_definition not like '%campaign_id is null%'
     or v_definition not like '%retry_seq <> 0%'
     or v_definition not like '%retry_seq = 0%'
     or v_definition not like '%legacy retry chain exists%'
     or v_definition not like
          '%rosetta-v3-deterministic-sql-2.5.13%'
     or v_definition not like
          '%rosetta-five-layer-structural-correctness-2.5.13%'
     or v_definition not like '%single_observation%'
     or v_definition not like '%reused_exact_attempt%'
     or v_definition not like '%receipt_kind = ''claim''%'
     or v_definition not like '%created%'
     or v_definition not like '%pg_advisory_xact_lock%' then
    raise exception 'manifest truth-observation claim can skip, retry, or escape membership';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_observation_execute(uuid,uuid,text,integer)'::regprocedure)
    into strict v_definition;
  if v_definition like '%source_replay_expectation%'
     or v_definition like '%retryable_failure%'
     or v_definition not like '%verify_sealed_manifest%'
     or v_definition not like '%historical_expectation_is_advisory%'
     or v_definition not like '%attempt.retry_seq <> 0%'
     or v_definition not like
          '%source-locked 120000 ms parser boundary%'
     or v_definition not like '%current_setting(''statement_timeout'')%'
     or v_definition not like '%automatic_retry%'
     or v_definition not like '%P1R22%'
     or v_definition not like '%P1R23%'
     or replace(v_definition,' ','') like '%''stage'',''outer''%' then
    raise exception 'manifest truth-observation executor is not expectation-free and final';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_observation_finalize(uuid,uuid,text)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%verify_sealed_manifest%'
     or v_definition not like '%rosetta_replay.replay_finalize%'
     or v_definition not like '%attempt.retry_seq <> 0%'
     or v_definition not like
          '%truth_observation_configuration_hash%'
     or v_definition not like '%closure_sha256(''v2513_'')%'
     or v_definition not like '%claim_receipt.receipt_payload%'
     or v_definition not like '%source.source_content_hash%'
     or v_definition not like '%member.source_content_hash%'
     or v_definition not like '%expectation_is_advisory%'
     or v_definition not like '%invocation_ambiguous%'
     or v_definition not like '%original_attempt_state%'
     or v_definition not like '%failed_retryable%'
     or v_definition not like '%retry_suppressed_by%'
     or v_definition not like '%automatic_retry%' then
    raise exception 'manifest truth-observation finalizer can lose or retry evidence';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.claim_attempt(uuid,text,text,text,text,text,interval)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%pg_advisory_xact_lock%'
     or v_definition not like '%protected_claim.receipt_payload%'
     or v_definition not like '%single_observation%'
     or v_definition not like '%legacy claim/retry is disabled%'
     or v_definition not like '%sealed_corpus_member%'
     or v_definition not like '%verify_sealed_manifest%'
     or v_definition not like '%legacy adoption/retry is disabled%'
     or v_definition not like
          '%claimed'',''running'',''failed_retryable'',''timed_out%'
     or v_definition not like '%P1Q46%' then
    raise exception 'legacy claim path can violate a sealed single observation';
  end if;

  select pg_get_viewdef(
      'rosetta_replay.v_replay_suppressed_identities'::regclass,true)
    into strict v_definition;
  if v_definition not like '%receipt_kind%'
     or v_definition not like '%success%'
     or v_definition not like '%rejection%'
     or v_definition not like '%deferred%'
     or v_definition not like '%terminal_failure%' then
    raise exception 'post-terminal manifest claims can erase suppression metadata';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_first_campaign_execute_next(uuid)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%when query_canceled then%raise;%'
     or v_definition like '%set pending_outcome = ''timeout''%' then
    raise exception 'campaign wrapper can relabel infrastructure cancellation as parser timeout';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.start_truth_first_replay_campaign(text,uuid,text,text,text,text,integer,integer,integer)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%p_queue_depth <> p_executor_count%'
     or v_definition not like '%p_timeout_ms <> 120000%'
     or v_definition not like '%set statement_timeout = %'
     or v_definition not like
          '%hard_backend_crash_before_committed_outcome%'
     or v_definition not like '%invocation_ambiguous%'
     or v_definition not like '%thresholds_stop_processing%'
     or v_definition not like '%false%' then
    raise exception 'truth-first scheduler does not preserve bounded honest execution';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.start_replay_campaign(text,text,text,text,text,integer,integer,integer,integer)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%legacy campaign start is disabled%' then
    raise exception 'unfrozen campaign starter is still active';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.replay_campaign_truth_gate(uuid)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%single_observation_v1%'
     or v_definition not like '%P1Q40%'
     or v_definition not like
          '%processing truth is not a compatibility or promotion decision%' then
    raise exception 'legacy truth gate can still reinterpret processing as promotion';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.replay_campaign_claim_refill(uuid)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%single_observation_v1%'
     or v_definition not like '%truth_first_campaign_claim_refill%' then
    raise exception 'legacy claim surface does not route truth-first campaigns';
  end if;

  select pg_get_functiondef(
      'rosetta_replay.truth_first_campaign_supervise(uuid)'::regprocedure)
    into strict v_definition;
  if v_definition not like '%staged_finalize_overdue%'
     or v_definition not like
          '%for update of attempt skip locked%'
     or v_definition not like '%quarantine_finalize_failure%'
     or v_definition not like
          '%staged outcome finalization lease expired; parser was not rerun%'
     or v_definition not like
          '%terminal attempts exist without immutable dispositions%'
     or v_definition like
          '%terminal or overdue staged attempts exist%' then
    raise exception 'supervisor can stop the corpus for ordinary finalizer lag';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'rosetta_replay.replay_campaign'::regclass
      and trigger_row.tgname = 'replay_campaign_truth_first_insert_guard'
      and not trigger_row.tgisinternal) then
    raise exception 'new campaigns can bypass truth-first insertion policy';
  end if;
end;
$test$;

rollback;
