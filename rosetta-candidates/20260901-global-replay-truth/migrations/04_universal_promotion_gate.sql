-- ============================================================================
-- Universal promotion gate
--
-- Promotion requires one exact authorized corpus, one observed all-pass replay,
-- complete prior-output diffs, zero regressions/unexplained changes, clean run
-- validation, and closure code containing no literal source identities.
-- Human or per-source dispositions cannot override any failed invariant.
-- ============================================================================

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.sealed_corpus_manifest') is null
     or to_regclass('rosetta_replay.member_diff_receipt') is null
     or to_regprocedure(
       'rosetta_replay.replay_campaign_universal_gate(uuid)') is null then
    raise exception 'universal promotion requires migrations 01 through 03'
      using errcode = 'P1C05';
  end if;
  if exists (
    select 1
    from rosetta_replay.snapshot_publication_receipt receipt
    where coalesce(receipt.gate_result->>'scope','') <>
      'universal_authorized_corpus'
  ) then
    raise exception 'legacy publication receipts require explicit reconciliation before installing the universal gate'
      using errcode = 'P1G22';
  end if;
end;
$preflight$;

-- Routine candidate writes take the shared side of this lock once per table
-- statement. Publication takes the exclusive side through the gate and keeps
-- the candidate/evidence snapshot frozen until its transaction commits.
create or replace function rosetta_replay.lock_global_candidate_write()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  perform pg_advisory_xact_lock_shared(20260901,1);
  return null;
end;
$function$;

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'corpus','source_document','source_document_content',
    'extraction_rule_manifest','actor_canon','rosetta_canonical_clause',
    'extraction_run','extraction_run_config','extraction_manifest',
    'hr1_raw_blocks','actor_alias','accountability_route','escalation_node',
    'appeal_pathway','entity_override','help_entity','workflow_pipeline',
    'workflow_step','term_definition','term_definition_affected_steps',
    'rosetta_clause_occurrence','layer_coverage','rosetta_clause_ir',
    'rosetta_object_correction','rosetta_object_source_span',
    'rosetta_structural_repair_queue','rosetta_structural_representation',
    'validation_result','projection_receipt'
  ] loop
    if to_regclass(format('rosetta_v2513.%I',v_table)) is not null then
      execute format(
        'drop trigger if exists global_promotion_write_lock on rosetta_v2513.%I',
        v_table);
      execute format(
        'create trigger global_promotion_write_lock '
        'before insert or update or delete on rosetta_v2513.%I '
        'for each statement execute function '
        'rosetta_replay.lock_global_candidate_write()',v_table);
    end if;
  end loop;
end;
$triggers$;

-- Recreate migration-03 statement locks in case an earlier preview installed
-- the initial row-trigger form.
drop trigger if exists sealed_manifest_evidence_write_lock
  on rosetta_replay.sealed_corpus_manifest;
create trigger sealed_manifest_evidence_write_lock
before insert on rosetta_replay.sealed_corpus_manifest
for each statement execute function rosetta_replay.lock_global_promotion_evidence_write();

drop trigger if exists object_diff_evidence_write_lock
  on rosetta_replay.object_diff;
create trigger object_diff_evidence_write_lock
before insert on rosetta_replay.object_diff
for each statement execute function rosetta_replay.lock_global_promotion_evidence_write();

drop trigger if exists member_diff_receipt_evidence_write_lock
  on rosetta_replay.member_diff_receipt;
create trigger member_diff_receipt_evidence_write_lock
before insert on rosetta_replay.member_diff_receipt
for each statement execute function rosetta_replay.lock_global_promotion_evidence_write();

create table if not exists rosetta_replay.universal_validation_requirement (
  engine_version text not null,
  rule_set_version text not null,
  closure_hash text not null check (closure_hash ~ '^[0-9a-f]{64}$'),
  test_name text not null check (length(btrim(test_name)) >= 3),
  created_at timestamptz not null default clock_timestamp(),
  primary key (engine_version,rule_set_version,closure_hash,test_name)
);

create or replace function rosetta_replay.reject_validation_requirement_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  raise exception 'universal_validation_requirement_is_immutable'
    using errcode = 'raise_exception';
end;
$function$;

drop trigger if exists universal_validation_requirement_immutable
  on rosetta_replay.universal_validation_requirement;
create trigger universal_validation_requirement_immutable
before update or delete on rosetta_replay.universal_validation_requirement
for each row execute function
  rosetta_replay.reject_validation_requirement_mutation();

alter table rosetta_replay.universal_validation_requirement
  enable row level security;
revoke all on table rosetta_replay.universal_validation_requirement
  from public,anon,authenticated,service_role;

insert into rosetta_replay.universal_validation_requirement (
  engine_version,rule_set_version,closure_hash,test_name)
select
  'rosetta-v3-deterministic-sql-2.5.28',
  'rosetta-five-layer-structural-correctness-2.5.28',
  'db2ed9b12dc1d95c14caa779ac50955bee4a5085190fb2fb356f5da4734a5727',
  required.test_name
from unnest(array[
  'canonical_rows_source_bound',
  'exact_source_structure_v2528',
  'five_layer_coverage',
  'independent_structure_v2528',
  'no_pending_coverage',
  'output_hash_verified',
  'source_bytes_receipted',
  'source_hash_verified',
  'structural_correctness_v2'
]) required(test_name)
on conflict do nothing;

create or replace function
  rosetta_replay.replay_closure_no_source_identity_gate(
    p_closure_prefix text)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  v_closure_hash text;
  v_bad bigint;
  v_details jsonb;
begin
  v_closure_hash := rosetta_replay.closure_sha256(p_closure_prefix);

  with definitions as (
    select procedure.proname function_name,
           lower(pg_get_functiondef(procedure.oid)) definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'rosetta_v2513'
      and procedure.proname like
        replace(p_closure_prefix,'_','\_') || '%' escape '\'
  ), observed_token as (
    select definitions.function_name,match[1] token
    from definitions
    cross join lateral regexp_matches(
      definitions.definition,
      $identity_regex$(https?://[^'[:space:])]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}|[0-9a-f]{32}|(?:text|amendment):[0-9]+:[0-9]+|[a-z][a-z0-9]{0,8}-[0-9][a-z0-9-]{2,}|[0-9]{6,8})$identity_regex$,
      'g') match
  ), identity_token as (
    select distinct lower(token) token,identity_type
    from (
      select source.source_content_id::text token,
             'source_content_id'::text identity_type
      from rosetta_replay.replay_source_registry source
      union all
      select source.source_content_hash,'source_content_hash'
      from rosetta_replay.replay_source_registry source
      union all
      select content.source_url,'source_url'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_byte_hash,'source_byte_hash'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_provider_hash,'source_provider_hash'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_identity_hash,'source_identity_hash'
      from rosetta_v2513.source_document_content content
      union all
      select metadata.value,'metadata:'||metadata.key
      from rosetta_v2513.source_document_content content
      cross join lateral jsonb_each_text(content.source_metadata) metadata
      where metadata.key in (
        'bill_number','docket_bill_id','docket_provider_document_id',
        'provider_document_id','docket_source_document_key',
        'docket_base_source_document_key',
        'docket_predecessor_source_document_key','docket_provider_hash',
        'provider_text_hash','extraction_text_byte_hash',
        'docket_provider_url','docket_source_url','extraction_text_url',
        'provider_state_link')
    ) identity
    where nullif(btrim(token),'') is not null
      and length(token) >= 6
  ), violation as (
    select distinct observed.function_name,identity.identity_type,
           encode(extensions.digest(convert_to(identity.token,'UTF8'),
             'sha256'),'hex') token_sha256
    from observed_token observed
    join identity_token identity on identity.token = observed.token
  )
  select count(*) into v_bad from violation;

  with definitions as (
    select procedure.proname function_name,
           lower(pg_get_functiondef(procedure.oid)) definition
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'rosetta_v2513'
      and procedure.proname like
        replace(p_closure_prefix,'_','\_') || '%' escape '\'
  ), observed_token as (
    select definitions.function_name,match[1] token
    from definitions
    cross join lateral regexp_matches(
      definitions.definition,
      $identity_regex$(https?://[^'[:space:])]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64}|[0-9a-f]{32}|(?:text|amendment):[0-9]+:[0-9]+|[a-z][a-z0-9]{0,8}-[0-9][a-z0-9-]{2,}|[0-9]{6,8})$identity_regex$,
      'g') match
  ), identity_token as (
    select distinct lower(token) token,identity_type
    from (
      select source.source_content_id::text token,
             'source_content_id'::text identity_type
      from rosetta_replay.replay_source_registry source
      union all
      select source.source_content_hash,'source_content_hash'
      from rosetta_replay.replay_source_registry source
      union all
      select content.source_url,'source_url'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_byte_hash,'source_byte_hash'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_provider_hash,'source_provider_hash'
      from rosetta_v2513.source_document_content content
      union all
      select content.source_identity_hash,'source_identity_hash'
      from rosetta_v2513.source_document_content content
      union all
      select metadata.value,'metadata:'||metadata.key
      from rosetta_v2513.source_document_content content
      cross join lateral jsonb_each_text(content.source_metadata) metadata
      where metadata.key in (
        'bill_number','docket_bill_id','docket_provider_document_id',
        'provider_document_id','docket_source_document_key',
        'docket_base_source_document_key',
        'docket_predecessor_source_document_key','docket_provider_hash',
        'provider_text_hash','extraction_text_byte_hash',
        'docket_provider_url','docket_source_url','extraction_text_url',
        'provider_state_link')
    ) identity
    where nullif(btrim(token),'') is not null
      and length(token) >= 6
  ), violation as (
    select distinct observed.function_name,identity.identity_type,
           encode(extensions.digest(convert_to(identity.token,'UTF8'),
             'sha256'),'hex') token_sha256
    from observed_token observed
    join identity_token identity on identity.token = observed.token
  )
  select coalesce(jsonb_agg(to_jsonb(sample)
           order by sample.function_name,sample.identity_type),
         '[]'::jsonb)
    into v_details
  from (
    select * from violation
    order by function_name,identity_type,token_sha256
    limit 20
  ) sample;

  if v_bad <> 0 then
    raise exception '% literal source identities occur in closure %: %',
      v_bad,p_closure_prefix,v_details using errcode = 'P1G23';
  end if;
  return jsonb_build_object(
    'gate','passed',
    'closure_prefix',p_closure_prefix,
    'closure_hash',v_closure_hash,
    'literal_source_identity_violations',0);
end;
$function$;

create or replace function rosetta_replay.replay_campaign_promotion_gate(
    p_manifest_id uuid,
    p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  manifest rosetta_replay.sealed_corpus_manifest%rowtype;
  v_campaign_gate jsonb;
  v_identity_gate jsonb;
  v_closure_hash text;
  v_bad bigint;
  v_required_tests integer;
  v_prior_members bigint;
  v_diff_receipts bigint;
  v_diff_rows bigint;
begin
  perform pg_advisory_xact_lock(20260901,1);

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for share;
  select * into strict manifest
  from rosetta_replay.sealed_corpus_manifest
  where manifest_id = p_manifest_id
  for share;

  v_campaign_gate :=
    rosetta_replay.replay_campaign_universal_gate(p_campaign_id);
  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  v_identity_gate :=
    rosetta_replay.replay_closure_no_source_identity_gate(c.closure_prefix);

  if not rosetta_replay.verify_sealed_manifest(p_manifest_id)
     or manifest.member_count <= 0
     or manifest.creation_receipt->>'contract' <>
          'universal-campaign-manifest-v1'
     or manifest.creation_receipt->>'campaign_id' <> p_campaign_id::text
     or manifest.creation_receipt->>'engine_version' <> c.engine_version
     or manifest.creation_receipt->>'rule_set_version' <> c.rule_set_version
     or manifest.creation_receipt->>'closure_prefix' <> c.closure_prefix
     or manifest.creation_receipt->>'closure_hash' <> v_closure_hash
     or manifest.creation_receipt->>'required_terminal_outcome' <>
          'completed'
     or (manifest.creation_receipt->>'per_source_exceptions')::boolean
          is distinct from false then
    raise exception 'manifest is not the exact immutable universal campaign contract'
      using errcode = 'P1G24';
  end if;

  -- Exact set equality: every eligible source is one exact manifest member and
  -- every member is eligible under this campaign's immutable authorization.
  select count(*) into v_bad
  from rosetta_replay.replay_source_registry source
  left join rosetta_replay.sealed_corpus_member member
    on member.manifest_id = p_manifest_id
   and member.source_registry_id = source.source_registry_id
   and member.source_content_id = source.source_content_id
   and member.source_content_hash = source.source_content_hash
   and member.byte_length = source.source_byte_length
   and member.expected_terminal_outcome = 'completed'
   and member.expected_failure_code is null
   and not member.quarantine_required
  where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id,c.closure_prefix)
    and member.source_registry_id is null;
  if v_bad <> 0 then
    raise exception '% eligible sources are absent or inexact in the universal manifest',v_bad
      using errcode = 'P1G24';
  end if;

  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member member
  left join rosetta_replay.replay_source_registry source
    on source.source_registry_id = member.source_registry_id
   and source.source_content_id = member.source_content_id
   and source.source_content_hash = member.source_content_hash
   and source.source_byte_length = member.byte_length
  where member.manifest_id = p_manifest_id
    and (
      source.source_registry_id is null
      or not rosetta_replay.replay_campaign_source_eligible(
        member.source_registry_id,c.closure_prefix)
      or member.expected_terminal_outcome <> 'completed'
      or member.expected_failure_code is not null
      or member.quarantine_required);
  if v_bad <> 0 then
    raise exception '% manifest members fall outside the universal campaign contract',v_bad
      using errcode = 'P1G24';
  end if;

  select count(*) into v_required_tests
  from rosetta_replay.universal_validation_requirement requirement
  where requirement.engine_version = c.engine_version
    and requirement.rule_set_version = c.rule_set_version
    and requirement.closure_hash = v_closure_hash;
  if v_required_tests = 0 then
    raise exception 'candidate identity has no immutable universal validation contract'
      using errcode = 'P1G25';
  end if;

  -- Every member must bind one clean admissible run with every globally
  -- required validation and no failed validation or open repair.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member member
  join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = member.source_registry_id
   and disposition.disposition = 'completed'
  join rosetta_replay.replay_run_binding binding
    on binding.attempt_id = disposition.attempt_id
   and binding.source_registry_id = member.source_registry_id
   and binding.source_content_id = member.source_content_id
   and binding.source_content_hash = member.source_content_hash
   and binding.engine_version = c.engine_version
   and binding.rule_set_version = c.rule_set_version
   and binding.configuration_hash = disposition.configuration_hash
   and binding.closure_hash = v_closure_hash
   and binding.terminal_outcome = 'completed'
  join rosetta_v2513.extraction_run run
    on run.id = binding.extraction_run_id
  where member.manifest_id = p_manifest_id
    and (
      run.source_document_id is distinct from binding.source_document_id
      or run.source_content_id is distinct from binding.source_content_id
      or run.source_content_hash is distinct from binding.source_content_hash
      or run.engine_version is distinct from binding.engine_version
      or run.rule_set_version is distinct from binding.rule_set_version
      or run.configuration_hash is distinct from binding.configuration_hash
      or run.output_content_hash is distinct from binding.output_content_hash
      or run.run_status <> 'completed'
      or run.admissibility_state <> 'admissible'
      or not exists (
        select 1
        from rosetta_v2513.extraction_manifest extraction_manifest
        where extraction_manifest.extraction_run_id = run.id
          and extraction_manifest.source_document_id = run.source_document_id
          and extraction_manifest.source_content_id = run.source_content_id
          and extraction_manifest.engine_version = run.engine_version
          and extraction_manifest.rule_set_version = run.rule_set_version
          and extraction_manifest.configuration_hash = run.configuration_hash
          and extraction_manifest.output_hash = run.output_content_hash
          and extraction_manifest.status = 'clean'
          and extraction_manifest.admissibility_state = 'admissible')
      or exists (
        select 1
        from rosetta_replay.universal_validation_requirement requirement
        where requirement.engine_version = c.engine_version
          and requirement.rule_set_version = c.rule_set_version
          and requirement.closure_hash = v_closure_hash
          and not exists (
            select 1
            from rosetta_v2513.validation_result validation
            where validation.extraction_run_id = run.id
              and validation.test_name = requirement.test_name
              and validation.test_result = 'pass'
              and coalesce(validation.failure_count,0) = 0))
      or exists (
        select 1
        from rosetta_v2513.validation_result validation
        where validation.extraction_run_id = run.id
          and (validation.test_result <> 'pass'
            or coalesce(validation.failure_count,0) <> 0))
      or exists (
        select 1
        from rosetta_v2513.rosetta_structural_repair_queue repair
        where repair.extraction_run_id = run.id
          and repair.repair_state = 'open'));
  if v_bad <> 0 then
    raise exception '% candidate members fail clean-run validation',v_bad
      using errcode = 'P1G25';
  end if;

  select count(*) into v_prior_members
  from rosetta_replay.sealed_corpus_member member
  where member.manifest_id = p_manifest_id
    and member.prior_output_state = 'admissible';

  select count(*) into v_diff_receipts
  from rosetta_replay.sealed_corpus_member member
  join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = member.source_registry_id
   and disposition.disposition = 'completed'
  join rosetta_replay.replay_run_binding binding
    on binding.attempt_id = disposition.attempt_id
   and binding.terminal_outcome = 'completed'
  join rosetta_replay.member_diff_receipt receipt
    on receipt.manifest_id = p_manifest_id
   and receipt.source_registry_id = member.source_registry_id
   and receipt.candidate_attempt_id = disposition.attempt_id
   and receipt.control_run_id = member.control_run_id
   and receipt.candidate_run_id = binding.extraction_run_id
   and receipt.complete
   and receipt.diff_row_count = receipt.union_field_count
  where member.manifest_id = p_manifest_id
    and member.prior_output_state = 'admissible'
    and member.control_run_id is not null
    and receipt.diff_row_count = (
      select count(*)
      from rosetta_replay.object_diff diff
      where diff.manifest_id = receipt.manifest_id
        and diff.source_registry_id = receipt.source_registry_id
        and diff.candidate_attempt_id = receipt.candidate_attempt_id
        and diff.control_run_id = receipt.control_run_id
        and diff.candidate_run_id = receipt.candidate_run_id);
  if v_diff_receipts <> v_prior_members then
    raise exception 'complete exact diff receipts % differ from prior-output members %',
      v_diff_receipts,v_prior_members using errcode = 'P1G26';
  end if;

  -- No caller label and no human disposition can convert a regression or an
  -- unexplained change into a pass. Candidate defects also block unchanged
  -- rows; improvements must be an observed defect -> no-defect transition.
  select count(*) into v_bad
  from rosetta_replay.object_diff diff
  join rosetta_replay.member_diff_receipt receipt
    on receipt.manifest_id = diff.manifest_id
   and receipt.source_registry_id = diff.source_registry_id
   and receipt.candidate_attempt_id = diff.candidate_attempt_id
   and receipt.control_run_id = diff.control_run_id
   and receipt.candidate_run_id = diff.candidate_run_id
  join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = diff.source_registry_id
   and disposition.attempt_id = diff.candidate_attempt_id
   and disposition.disposition = 'completed'
  where diff.manifest_id = p_manifest_id
    and (
      diff.engine_version is distinct from c.engine_version
      or diff.rule_set_version is distinct from c.rule_set_version
      or diff.configuration_hash is distinct from
        disposition.configuration_hash
      or diff.closure_hash is distinct from v_closure_hash
      or diff.correction_id is not null
      or diff.status in ('regression','unexplained')
      or diff.candidate_defect is not null
      or (diff.status = 'improvement_declared' and not (
        diff.control_defect is not null
        and diff.candidate_defect is null)));
  if v_bad <> 0 then
    raise exception '% object-field diffs violate universal no-regression semantics',v_bad
      using errcode = 'P1G26';
  end if;

  select count(*) into v_bad
  from rosetta_replay.object_diff diff
  where diff.manifest_id = p_manifest_id
    and not exists (
      select 1
      from rosetta_replay.member_diff_receipt receipt
      join rosetta_replay.replay_campaign_source_disposition disposition
        on disposition.campaign_id = p_campaign_id
       and disposition.source_registry_id = receipt.source_registry_id
       and disposition.attempt_id = receipt.candidate_attempt_id
       and disposition.disposition = 'completed'
      where receipt.manifest_id = diff.manifest_id
        and receipt.source_registry_id = diff.source_registry_id
        and receipt.candidate_attempt_id = diff.candidate_attempt_id
        and receipt.control_run_id = diff.control_run_id
        and receipt.candidate_run_id = diff.candidate_run_id);
  if v_bad <> 0 then
    raise exception '% object diffs are outside exact current campaign receipts',v_bad
      using errcode = 'P1G26';
  end if;

  select coalesce(sum(receipt.diff_row_count),0) into v_diff_rows
  from rosetta_replay.member_diff_receipt receipt
  join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = receipt.source_registry_id
   and disposition.attempt_id = receipt.candidate_attempt_id
   and disposition.disposition = 'completed'
  where receipt.manifest_id = p_manifest_id;

  return jsonb_build_object(
    'gate','passed',
    'scope','universal_authorized_corpus',
    'manifest_id',p_manifest_id,
    'campaign_id',p_campaign_id,
    'source_count',manifest.member_count,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'closure_prefix',c.closure_prefix,
    'closure_hash',v_closure_hash,
    'required_validation_tests',v_required_tests,
    'prior_output_members',v_prior_members,
    'complete_diff_receipts',v_diff_receipts,
    'object_field_diff_rows',v_diff_rows,
    'regressions',0,
    'unexplained_changes',0,
    'per_source_exceptions',false,
    'campaign_gate',v_campaign_gate,
    'source_identity_gate',v_identity_gate);
end;
$function$;

-- Legacy gate signatures cannot prove a campaign-wide observed all-pass result.
create or replace function rosetta_replay.promotion_gate_check(
    p_manifest_id uuid,
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_configuration_contract_hash text,
    p_closure_hash text,
    p_quarantine_set_id text)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
begin
  raise exception 'legacy promotion gate is disabled; campaign-wide universal evidence is required'
    using errcode = 'P1G22';
end;
$function$;

create or replace function rosetta_replay.v2528_snapshot_publication_gate(
    p_snapshot_id uuid,
    p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','public','extensions'
as $function$
declare
  v_engine constant text := 'rosetta-v3-deterministic-sql-2.5.28';
  v_rules constant text :=
    'rosetta-five-layer-structural-correctness-2.5.28';
  v_prefix constant text := 'v2528_';
  v_rule_manifest constant text :=
    '626f07d085d088c145f809de7891d36b70cfc85dee5fe69190f7108914410264';
  v_closure constant text :=
    'db2ed9b12dc1d95c14caa779ac50955bee4a5085190fb2fb356f5da4734a5727';
  s rosetta_replay.corpus_snapshot_receipt%rowtype;
  c rosetta_replay.replay_campaign%rowtype;
  v_manifest uuid;
  v_manifest_count integer;
  v_count integer;
  v_bytes bigint;
  v_membership_hash text;
  v_auth_variants integer;
  v_bad bigint;
  v_gate jsonb;
begin
  perform pg_advisory_xact_lock(20260901,1);

  select * into strict s
  from rosetta_replay.corpus_snapshot_receipt
  where snapshot_id = p_snapshot_id
  for share;
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for share;

  if c.closure_prefix <> v_prefix
     or c.engine_version <> v_engine
     or c.rule_set_version <> v_rules
     or rosetta_replay.closure_sha256(v_prefix) <> v_closure
     or not exists (
       select 1
       from rosetta_v2513.extraction_rule_manifest rule_manifest
       where rule_manifest.engine_version = v_engine
         and rule_manifest.rule_set_version = v_rules
         and rule_manifest.manifest_hash = v_rule_manifest
         and rule_manifest.is_active) then
    raise exception 'snapshot campaign is not the exact active v2528 generation identity'
      using errcode = 'P1P28';
  end if;

  select count(*)::integer,
         coalesce(sum(source.source_byte_length),0)::bigint,
         encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
           source.source_content_id::text,
           source.source_content_hash,
           source.source_byte_length::text),chr(10)
           order by source.source_content_hash,source.source_content_id),''),
           'UTF8'),'sha256'),'hex'),
         count(distinct auth.authorization_sha256)::integer
    into v_count,v_bytes,v_membership_hash,v_auth_variants
  from rosetta_replay.candidate_generation_authorization auth
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = auth.source_registry_id
  where auth.snapshot_id = p_snapshot_id
    and auth.engine_version = v_engine
    and auth.rule_set_version = v_rules
    and auth.closure_prefix = v_prefix
    and auth.closure_hash = v_closure
    and auth.authorization_scope = 'full_candidate_generation';

  if v_count is distinct from s.source_count
     or v_count <= 0
     or v_bytes is distinct from s.source_total_bytes
     or v_membership_hash is distinct from s.source_membership_sha256
     or v_auth_variants <> 1 then
    raise exception 'v2528 authorization membership differs from immutable snapshot'
      using errcode = 'P1P28';
  end if;

  select count(*) into v_bad
  from rosetta_replay.candidate_generation_authorization auth
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = auth.source_registry_id
  join rosetta_v2513.source_document_content candidate
    on candidate.source_content_id = source.source_content_id
   and candidate.source_content_hash = source.source_content_hash
  left join public.source_document_content production
    on production.source_content_id = candidate.source_content_id
  where auth.snapshot_id = p_snapshot_id
    and auth.engine_version = v_engine
    and auth.rule_set_version = v_rules
    and auth.closure_prefix = v_prefix
    and auth.closure_hash = v_closure
    and auth.authorization_scope = 'full_candidate_generation'
    and (
      source.source_content_hash is distinct from
        encode(extensions.digest(convert_to(candidate.source_text,'UTF8'),
          'sha256'),'hex')
      or source.source_byte_length is distinct from
        octet_length(convert_to(candidate.source_text,'UTF8'))
      or production.source_content_id is null
      or to_jsonb(production) is distinct from to_jsonb(candidate));
  if v_bad <> 0 then
    raise exception '% snapshot members fail exact bytes or public/candidate identity',v_bad
      using errcode = 'P1P28';
  end if;

  if (select count(*) from public.source_document_content) <> s.source_count
     or (select count(*) from rosetta_v2513.source_document_content) <>
          s.source_count
     or (select count(*) from rosetta_replay.replay_source_registry) <>
          s.source_count then
    raise exception 'source corpus changed after the sealed snapshot'
      using errcode = 'P1P28';
  end if;

  select count(*),
         (array_agg(manifest.manifest_id order by manifest.manifest_id))[1]
    into v_manifest_count,v_manifest
  from rosetta_replay.sealed_corpus_manifest manifest
  where manifest.creation_receipt->>'contract' =
          'universal-campaign-manifest-v1'
    and manifest.creation_receipt->>'snapshot_id' = p_snapshot_id::text
    and manifest.creation_receipt->>'campaign_id' = p_campaign_id::text;
  if v_manifest_count <> 1 then
    raise exception 'snapshot requires exactly one universal campaign manifest; found %',
      v_manifest_count using errcode = 'P1P28';
  end if;

  v_gate := rosetta_replay.replay_campaign_promotion_gate(
    v_manifest,p_campaign_id);
  return v_gate || jsonb_build_object(
    'gate','passed',
    'scope','universal_authorized_corpus',
    'snapshot_id',p_snapshot_id,
    'manifest_id',v_manifest,
    'campaign_id',p_campaign_id,
    'source_count',v_count,
    'source_membership_sha256',v_membership_hash,
    'engine_version',v_engine,
    'rule_set_version',v_rules,
    'rule_manifest_hash',v_rule_manifest,
    'closure_prefix',v_prefix,
    'closure_hash',v_closure,
    'rejected_sources',0,
    'deferred_sources',0,
    'timed_out_sources',0,
    'failed_sources',0,
    'per_source_exceptions',false);
end;
$function$;

revoke all on function
  rosetta_replay.lock_global_candidate_write(),
  rosetta_replay.reject_validation_requirement_mutation(),
  rosetta_replay.replay_closure_no_source_identity_gate(text),
  rosetta_replay.replay_campaign_promotion_gate(uuid,uuid),
  rosetta_replay.promotion_gate_check(uuid,text,text,text,text,text,text),
  rosetta_replay.v2528_snapshot_publication_gate(uuid,uuid)
  from public,anon,authenticated,service_role;

grant execute on function
  rosetta_replay.lock_global_candidate_write(),
  rosetta_replay.reject_validation_requirement_mutation(),
  rosetta_replay.replay_closure_no_source_identity_gate(text),
  rosetta_replay.replay_campaign_promotion_gate(uuid,uuid),
  rosetta_replay.promotion_gate_check(uuid,text,text,text,text,text,text),
  rosetta_replay.v2528_snapshot_publication_gate(uuid,uuid)
  to postgres;
