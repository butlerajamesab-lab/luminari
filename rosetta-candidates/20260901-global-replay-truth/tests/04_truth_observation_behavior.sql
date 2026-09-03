-- Sealed-manifest Render-worker lifecycle proof.
--
-- Run after migration 07 in the source-locked preview database.  This clones
-- one immutable source inside a rollback-only transaction, gives the clone a
-- deliberately wrong historical expectation, and proves that the parser is
-- still invoked exactly once and its actual success is bound.  No fixture row
-- or parser output survives the final rollback.

begin;

create temp table truth_observation_probe (
  original_source_registry_id uuid not null,
  source_document_id integer,
  source_content_id uuid not null,
  source_registry_id uuid not null,
  manifest_id uuid not null,
  source_version text not null,
  document_identifier text not null,
  attempt_id uuid,
  config_hash text,
  closure_hash text,
  claim_result jsonb,
  execute_result jsonb,
  final_receipt uuid,
  preassociation_adoption_sqlstate text,
  preassociation_retry_sqlstate text,
  legacy_claim_sqlstate text,
  second_execute_sqlstate text,
  extraction_runs_before bigint,
  extraction_runs_after_first bigint
) on commit drop;

insert into truth_observation_probe (
  original_source_registry_id,source_content_id,source_registry_id,
  manifest_id,source_version,document_identifier)
select
  '905ffd01-fb35-4f84-94a3-272b6128468a'::uuid,
  gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
  'rollback-truth-observation-' || token,
  'ROLLBACK-TRUTH-OBSERVATION-' || upper(token)
from (
  select substr(replace(gen_random_uuid()::text,'-',''),1,12) token
) unique_token;

with inserted as (
  insert into rosetta_v2513.source_document (
    corpus_id,document_name,document_type,document_identifier)
  select original.corpus_id,
         'rollback truth observation fixture',
         original.document_type,
         probe.document_identifier
  from truth_observation_probe probe
  join rosetta_replay.replay_source_registry original_registry
    on original_registry.source_registry_id =
       probe.original_source_registry_id
  join rosetta_v2513.source_document_content original_content
    on original_content.source_content_id =
       original_registry.source_content_id
  join rosetta_v2513.source_document original
    on original.id = original_content.source_document_id
  returning id
)
update truth_observation_probe
set source_document_id = (select id from inserted);

insert into rosetta_v2513.source_document_content (
  source_content_id,source_document_id,source_version,source_url,media_type,
  source_text,source_content_hash,source_byte_hash,source_provider_hash,
  source_identity_hash,source_metadata)
select
  probe.source_content_id,probe.source_document_id,probe.source_version,
  original.source_url,original.media_type,original.source_text,
  original.source_content_hash,original.source_byte_hash,
  original.source_provider_hash,
  encode(extensions.digest(convert_to(jsonb_build_object(
    'document_identifier',probe.document_identifier,
    'source_version',probe.source_version,
    'source_url',original.source_url,
    'source_content_hash',original.source_content_hash,
    'source_byte_hash',original.source_byte_hash,
    'media_type',original.media_type)::text,'UTF8'),'sha256'),'hex'),
  original.source_metadata
from truth_observation_probe probe
join rosetta_replay.replay_source_registry original_registry
  on original_registry.source_registry_id =
     probe.original_source_registry_id
join rosetta_v2513.source_document_content original
  on original.source_content_id = original_registry.source_content_id;

insert into rosetta_replay.replay_source_registry (
  source_registry_id,source_content_id,source_content_hash,
  source_byte_length,charset_receipt,registered_by)
select
  probe.source_registry_id,probe.source_content_id,
  original_registry.source_content_hash,
  original_registry.source_byte_length,
  original_registry.charset_receipt,
  'rollback-truth-observation-probe'
from truth_observation_probe probe
join rosetta_replay.replay_source_registry original_registry
  on original_registry.source_registry_id =
     probe.original_source_registry_id;

-- Deliberately disagree with the expected successful parser result.  This row
-- is copied into the final receipt for history only; it cannot suppress or
-- redefine the observation.
insert into rosetta_replay.source_replay_expectation (
  source_registry_id,expected_terminal_outcome,expected_failure_code,
  prior_output_state,control_run_id,quarantine_required,
  expectation_rationale,expectation_sha256,declared_by)
select
  probe.source_registry_id,'rejected','historical_fixture_rejection',
  'none',null,true,
  'rollback-only wrong expectation; actual outcome remains authoritative',
  encode(extensions.digest(convert_to(jsonb_build_object(
    'source_registry_id',probe.source_registry_id,
    'source_content_id',registry.source_content_id,
    'source_content_hash',registry.source_content_hash,
    'expected_terminal_outcome','rejected',
    'expected_failure_code','historical_fixture_rejection',
    'prior_output_state','none',
    'control_run_id',null,
    'quarantine_required',true,
    'rationale',
      'rollback-only wrong expectation; actual outcome remains authoritative'
  )::text,'UTF8'),'sha256'),'hex'),
  'rollback-truth-observation-probe'
from truth_observation_probe probe
join rosetta_replay.replay_source_registry registry
  on registry.source_registry_id = probe.source_registry_id;

insert into rosetta_replay.sealed_corpus_manifest (
  manifest_id,label,watermark,member_count,total_bytes,manifest_sha256,
  expected_tallies,creation_receipt)
select
  probe.manifest_id,'rollback truth-observation probe',clock_timestamp(),1,
  registry.source_byte_length,
  encode(extensions.digest(convert_to(concat_ws('|',
    registry.source_content_id::text,
    registry.source_content_hash,
    registry.source_byte_length::text,
    expectation.expected_terminal_outcome,
    coalesce(expectation.expected_failure_code,''),
    expectation.prior_output_state,
    coalesce(expectation.control_run_id::text,''),
    expectation.quarantine_required::text,
    expectation.expectation_sha256),'UTF8'),'sha256'),'hex'),
  jsonb_build_object('rejected',1),
  jsonb_build_object('test_fixture',true,'rolled_back',true)
from truth_observation_probe probe
join rosetta_replay.replay_source_registry registry
  on registry.source_registry_id = probe.source_registry_id
join rosetta_replay.source_replay_expectation expectation
  on expectation.source_registry_id = probe.source_registry_id;

insert into rosetta_replay.sealed_corpus_member (
  manifest_id,ordinal,source_registry_id,source_content_id,
  source_content_hash,byte_length,expected_terminal_outcome,
  expected_failure_code,prior_output_state,control_run_id,
  quarantine_required,expectation_sha256)
select
  probe.manifest_id,1,registry.source_registry_id,
  registry.source_content_id,registry.source_content_hash,
  registry.source_byte_length,expectation.expected_terminal_outcome,
  expectation.expected_failure_code,expectation.prior_output_state,
  expectation.control_run_id,expectation.quarantine_required,
  expectation.expectation_sha256
from truth_observation_probe probe
join rosetta_replay.replay_source_registry registry
  on registry.source_registry_id = probe.source_registry_id
join rosetta_replay.source_replay_expectation expectation
  on expectation.source_registry_id = probe.source_registry_id;

do $assert_manifest$
declare
  v_manifest uuid;
begin
  select manifest_id into strict v_manifest from truth_observation_probe;
  if not rosetta_replay.verify_sealed_manifest(v_manifest) then
    raise exception 'TEST_FAIL: rollback truth-observation manifest is invalid';
  end if;
end;
$assert_manifest$;

update truth_observation_probe probe
set config_hash =
      rosetta_replay.truth_observation_configuration_hash(
        probe.source_registry_id),
    closure_hash = rosetta_replay.closure_sha256('v2513_'),
    extraction_runs_before =
      (select count(*) from rosetta_v2513.extraction_run);

-- An old, expired running row is invocation-ambiguous. The legacy surface
-- must not adopt it for a sealed member and risk invoking the parser again.
do $sealed_preassociation_adoption_blocked$
declare
  probe truth_observation_probe%rowtype;
  v_legacy_attempt uuid;
  v_blocked_sqlstate text;
begin
  select * into strict probe from truth_observation_probe;
  begin
    v_legacy_attempt := rosetta_replay.claim_attempt(
      probe.source_registry_id,
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      probe.config_hash,probe.closure_hash,
      'rollback-preassociation-owner',interval '5 minutes');
    update rosetta_replay.replay_attempt
    set attempt_state = 'running',
        started_at = clock_timestamp() - interval '10 minutes',
        lease_expires_at = clock_timestamp() - interval '5 minutes'
    where attempt_id = v_legacy_attempt;
    begin
      perform rosetta_replay.claim_attempt(
        probe.source_registry_id,
        'rosetta-v3-deterministic-sql-2.5.13',
        'rosetta-five-layer-structural-correctness-2.5.13',
        probe.config_hash,probe.closure_hash,
        'rollback-preassociation-adopter',interval '5 minutes');
      raise exception 'TEST_FAIL: ambiguous legacy attempt was adopted';
    exception
      when sqlstate 'P1Q46' then
        v_blocked_sqlstate := sqlstate;
    end;
    if v_blocked_sqlstate is distinct from 'P1Q46' then
      raise exception 'TEST_FAIL: preassociation adoption was not blocked';
    end if;
    raise exception 'rollback successful preassociation adoption probe'
      using errcode = 'P1Q48';
  exception
    when sqlstate 'P1Q48' then
      update truth_observation_probe
      set preassociation_adoption_sqlstate = v_blocked_sqlstate;
  end;
end;
$sealed_preassociation_adoption_blocked$;

-- Prove the no-rerun reservation exists from intact manifest membership,
-- before the Render worker has associated a single-observation claim. The
-- inner subtransaction creates a legacy timeout, verifies retry refusal, then
-- deliberately rolls the probe back so the real lifecycle below starts clean.
do $sealed_preassociation_retry_blocked$
declare
  probe truth_observation_probe%rowtype;
  v_legacy_attempt uuid;
  v_blocked_sqlstate text;
begin
  select * into strict probe from truth_observation_probe;
  begin
    v_legacy_attempt := rosetta_replay.claim_attempt(
      probe.source_registry_id,
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      probe.config_hash,probe.closure_hash,
      'rollback-preassociation-probe',interval '5 minutes');
    perform rosetta_replay.finalize_attempt(
      v_legacy_attempt,'timeout','57014','rollback-only timeout probe',
      'rollback-preassociation-probe',
      jsonb_build_object('test_fixture',true,'parser_invoked',false));
    begin
      perform rosetta_replay.claim_attempt(
        probe.source_registry_id,
        'rosetta-v3-deterministic-sql-2.5.13',
        'rosetta-five-layer-structural-correctness-2.5.13',
        probe.config_hash,probe.closure_hash,
        'rollback-preassociation-retry-probe',interval '5 minutes');
      raise exception 'TEST_FAIL: preassociation legacy retry escaped sealed membership';
    exception
      when sqlstate 'P1Q46' then
        v_blocked_sqlstate := sqlstate;
    end;
    if v_blocked_sqlstate is distinct from 'P1Q46' then
      raise exception 'TEST_FAIL: preassociation retry was not structurally blocked';
    end if;
    raise exception 'rollback successful preassociation probe'
      using errcode = 'P1Q48';
  exception
    when sqlstate 'P1Q48' then
      update truth_observation_probe
      set preassociation_retry_sqlstate = v_blocked_sqlstate;
  end;
end;
$sealed_preassociation_retry_blocked$;

update truth_observation_probe probe
set claim_result = rosetta_replay.truth_observation_claim(
      probe.manifest_id,probe.source_registry_id,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      probe.config_hash,probe.closure_hash,
      'rollback-truth-observation-probe',interval '5 minutes');

update truth_observation_probe
set attempt_id = (claim_result->>'attempt_id')::uuid;

-- The compatibility claim surface shares the exact-identity lock and must
-- refuse both adoption and retry creation once this manifest has claimed its
-- single observation.
do $legacy_claim_blocked$
declare
  probe truth_observation_probe%rowtype;
begin
  select * into strict probe from truth_observation_probe;
  begin
    perform rosetta_replay.claim_attempt(
      probe.source_registry_id,
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      probe.config_hash,probe.closure_hash,
      'rollback-legacy-claim-probe',interval '5 minutes');
    raise exception 'TEST_FAIL: legacy claim escaped single-observation guard';
  exception
    when sqlstate 'P1Q46' then
      update truth_observation_probe set legacy_claim_sqlstate = sqlstate;
  end;
end;
$legacy_claim_blocked$;

-- The timeout must be armed in a prior top-level statement.  The executor
-- treats it as a parser boundary, never as a retry timer.
set local statement_timeout = '120000ms';
update truth_observation_probe probe
set execute_result = rosetta_replay.truth_observation_execute(
      probe.attempt_id,probe.manifest_id,'v2513_',120000);
set local statement_timeout = '0';

update truth_observation_probe
set extraction_runs_after_first =
      (select count(*) from rosetta_v2513.extraction_run);

update truth_observation_probe probe
set final_receipt = rosetta_replay.truth_observation_finalize(
      probe.attempt_id,probe.manifest_id,
      'rollback-truth-observation-probe');

-- A disposed observation can never invoke the parser again.
do $second_execution$
declare
  v_attempt uuid;
  v_manifest uuid;
begin
  select attempt_id,manifest_id into strict v_attempt,v_manifest
  from truth_observation_probe;
  begin
    perform set_config('statement_timeout','120000ms',true);
    perform rosetta_replay.truth_observation_execute(
      v_attempt,v_manifest,'v2513_',120000);
    raise exception 'TEST_FAIL: second parser execution unexpectedly succeeded';
  exception
    when sqlstate 'P1Q44' then
      update truth_observation_probe
      set second_execute_sqlstate = sqlstate;
  end;
  perform set_config('statement_timeout','0',true);
end;
$second_execution$;

do $assert_truth_observation$
declare
  probe truth_observation_probe%rowtype;
  attempt rosetta_replay.replay_attempt%rowtype;
  binding rosetta_replay.replay_run_binding%rowtype;
  run rosetta_v2513.extraction_run%rowtype;
  v_receipt_payload jsonb;
  v_exact_attempts integer;
  v_binding_count integer;
  v_extraction_runs_after_second bigint;
begin
  select * into strict probe from truth_observation_probe;
  select * into strict attempt
  from rosetta_replay.replay_attempt
  where attempt_id = probe.attempt_id;
  select * into strict binding
  from rosetta_replay.replay_run_binding
  where attempt_id = probe.attempt_id;
  select * into strict run
  from rosetta_v2513.extraction_run
  where id = binding.extraction_run_id;
  select receipt_payload into strict v_receipt_payload
  from rosetta_replay.replay_receipt
  where receipt_id = probe.final_receipt;
  select count(*) into v_exact_attempts
  from rosetta_replay.replay_attempt sibling
  where sibling.campaign_id is null
    and sibling.attempt_identity = attempt.attempt_identity;
  select count(*) into v_binding_count
  from rosetta_replay.replay_run_binding observed_binding
  where observed_binding.attempt_id = probe.attempt_id;
  select count(*) into v_extraction_runs_after_second
  from rosetta_v2513.extraction_run;

  if (probe.claim_result->>'created')::boolean is distinct from true
     or probe.claim_result->>'attempt_state' is distinct from 'running'
     or (probe.claim_result->>'parser_invoked')::boolean is distinct from false
     or probe.execute_result->>'pending_outcome' is distinct from 'success'
     or (probe.execute_result->>'parser_invoked')::boolean is distinct from true
     or (probe.execute_result->>'automatic_retry')::boolean
          is distinct from false
     or attempt.attempt_state is distinct from 'succeeded'
     or attempt.pending_outcome is not null
     or binding.terminal_outcome is distinct from 'completed'
     or binding.configuration_hash is distinct from probe.config_hash
     or run.configuration_hash is distinct from probe.config_hash
     or run.run_status is distinct from 'completed'
     or run.admissibility_state is distinct from 'admissible'
     or probe.extraction_runs_after_first
          is distinct from probe.extraction_runs_before + 1
     or v_extraction_runs_after_second
          is distinct from probe.extraction_runs_after_first
     or probe.second_execute_sqlstate is distinct from 'P1Q44'
     or probe.preassociation_adoption_sqlstate is distinct from 'P1Q46'
     or probe.preassociation_retry_sqlstate is distinct from 'P1Q46'
     or probe.legacy_claim_sqlstate is distinct from 'P1Q46'
     or v_exact_attempts is distinct from 1
     or v_binding_count is distinct from 1
     or v_receipt_payload->>'expectation_is_advisory'
          is distinct from 'true'
     or v_receipt_payload->'historical_expectation'
          ->>'expected_terminal_outcome' is distinct from 'rejected'
     or v_receipt_payload->>'observed_terminal_outcome'
          is distinct from 'completed' then
    raise exception
      'TEST_FAIL: truth observation did not bind one actual result without rerun: %',
      jsonb_build_object(
        'claim_result',probe.claim_result,
        'execute_result',probe.execute_result,
        'attempt_state',attempt.attempt_state,
        'terminal_outcome',binding.terminal_outcome,
        'preassociation_adoption_sqlstate',
          probe.preassociation_adoption_sqlstate,
        'preassociation_retry_sqlstate',
          probe.preassociation_retry_sqlstate,
        'legacy_claim_sqlstate',probe.legacy_claim_sqlstate,
        'second_execute_sqlstate',probe.second_execute_sqlstate,
        'attempt_count',v_exact_attempts,
        'binding_count',v_binding_count,
        'runs_before',probe.extraction_runs_before,
        'runs_after_first',probe.extraction_runs_after_first,
        'runs_after_second',v_extraction_runs_after_second,
        'receipt_payload',v_receipt_payload);
  end if;
end;
$assert_truth_observation$;

rollback;
