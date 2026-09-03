begin;

-- A corpus result and a source result are different facts. A candidate may
-- truthfully reject a source that the current production generation never
-- admitted. It may not turn that rejection into a source pass, regress a
-- source that production admitted, time out nondeterministically, or rely on
-- a literal source identity. This migration keeps those facts separate.

do $prerequisite$
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.sealed_corpus_manifest') is null
     or to_regclass('public.rosetta_current_generation_registry_v1') is null
     or to_regprocedure(
       'rosetta_replay.replay_closure_no_source_identity_gate(text)') is null then
    raise exception 'truthful mixed-outcome compatibility requires migrations 01 through 05'
      using errcode = '55000';
  end if;
end;
$prerequisite$;

comment on column rosetta_replay.replay_campaign.replay_result is
  'Source-outcome aggregate only: pass means every source completed; nonpass means one or more sources did not complete. Promotion compatibility is evaluated separately and never relabels a rejected source as passed.';

create or replace function rosetta_replay.replay_campaign_truth_gate(
    p_campaign_id uuid)
returns jsonb
language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','public'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  progress jsonb;
  v_closure_hash text;
  v_current_engine text;
  v_current_rules text;
  v_prior_admissible bigint;
  v_prior_admissible_noncompleted bigint;
  v_invalid bigint;
  v_missing bigint;
begin
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;

  progress := rosetta_replay.replay_campaign_progress(p_campaign_id);
  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);

  if c.campaign_state <> 'completed'
     or (progress->>'coverage_complete')::boolean is not true
     or (progress->>'source_total')::bigint <= 0
     or (progress->>'accounted_sources')::bigint <>
          (progress->>'source_total')::bigint
     or (progress->>'remaining_sources')::bigint <> 0
     or (progress->>'running_attempts')::bigint <> 0
     or (progress->>'pending_finalize')::bigint <> 0
     or (progress->>'terminal_orphans')::bigint <> 0 then
    raise exception 'campaign % does not have complete truthful accounting: %',
      p_campaign_id,progress using errcode = 'P1T01';
  end if;

  -- Timeouts and executor failures are truthful observations, but they are not
  -- stable parser support boundaries. Replace them with a deterministic
  -- global rejection/deferral rule or repair the engine before promotion.
  if (progress->>'timed_out_sources')::bigint <> 0
     or (progress->>'retry_exhausted_sources')::bigint <> 0
     or (progress->>'failed_terminal_sources')::bigint <> 0 then
    raise exception 'campaign % contains nondeterministic or operational outcomes: %',
      p_campaign_id,progress using errcode = 'P1T02';
  end if;

  select registry.engine_version,registry.rule_set_version
    into strict v_current_engine,v_current_rules
  from public.rosetta_current_generation_registry_v1 registry
  where registry.singleton;

  -- A production-admissible exact source is a positive compatibility member.
  -- The rule is derived from current-generation evidence, never a source ID or
  -- a caller-provided expected outcome.
  with eligible as (
    select source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           content.source_document_id
    from rosetta_replay.replay_source_registry source
    join rosetta_v2513.source_document_content content
      on content.source_content_id = source.source_content_id
     and content.source_content_hash = source.source_content_hash
    where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id,c.closure_prefix)
  ), prior_admissible as (
    select eligible.source_registry_id
    from eligible
    where exists (
      select 1
      from public.extraction_run control
      where control.source_document_id = eligible.source_document_id
        and control.source_content_id = eligible.source_content_id
        and control.source_content_hash = eligible.source_content_hash
        and control.engine_version = v_current_engine
        and control.rule_set_version = v_current_rules
        and control.run_status = 'completed'
        and control.admissibility_state = 'admissible'
        and control.output_content_hash is not null)
  )
  select count(*)::bigint,
         count(*) filter (
           where disposition.disposition is distinct from 'completed')::bigint
    into v_prior_admissible,v_prior_admissible_noncompleted
  from prior_admissible prior
  left join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = prior.source_registry_id;

  if v_prior_admissible_noncompleted <> 0 then
    raise exception '% production-admissible sources did not complete under candidate %',
      v_prior_admissible_noncompleted,p_campaign_id using errcode = 'P1T03';
  end if;

  -- Recompute every disposition binding. Rejections and deterministic
  -- deferrals remain explicit source nonpasses; only completed runs need an
  -- admissible candidate extraction row.
  with disposition_check as (
    select disposition.source_registry_id,
           disposition.disposition,
           disposition.disposition in (
             'completed','rejected','deferred_oversized')
             and disposition.engine_version = c.engine_version
             and disposition.rule_set_version = c.rule_set_version
             and disposition.closure_hash = v_closure_hash
             and rosetta_replay.replay_campaign_source_eligible(
               disposition.source_registry_id,c.closure_prefix)
             as identity_valid,
           source.source_registry_id as exact_source,
           attempt.attempt_id as exact_attempt,
           receipt.receipt_id as exact_receipt,
           binding.attempt_id as exact_binding,
           run.id as exact_completed_run
    from rosetta_replay.replay_campaign_source_disposition disposition
    left join rosetta_replay.replay_source_registry source
      on source.source_registry_id = disposition.source_registry_id
     and source.source_content_id = disposition.source_content_id
     and source.source_content_hash = disposition.source_content_hash
    left join rosetta_replay.replay_attempt attempt
      on attempt.attempt_id = disposition.attempt_id
     and attempt.source_registry_id = disposition.source_registry_id
     and attempt.engine_version = disposition.engine_version
     and attempt.rule_set_version = disposition.rule_set_version
     and attempt.config_hash = disposition.configuration_hash
     and attempt.closure_hash = disposition.closure_hash
     and attempt.retry_seq = disposition.retry_seq
    left join rosetta_replay.replay_receipt receipt
      on receipt.receipt_id = disposition.receipt_id
     and receipt.attempt_id = disposition.attempt_id
     and receipt.receipt_kind = case disposition.disposition
       when 'completed' then 'success'
       when 'rejected' then 'rejection'
       when 'deferred_oversized' then 'deferred'
     end
    left join rosetta_replay.replay_run_binding binding
      on binding.attempt_id = disposition.attempt_id
     and binding.source_registry_id = disposition.source_registry_id
     and binding.source_content_id = disposition.source_content_id
     and binding.source_content_hash = disposition.source_content_hash
     and binding.engine_version = disposition.engine_version
     and binding.rule_set_version = disposition.rule_set_version
     and binding.configuration_hash = disposition.configuration_hash
     and binding.closure_hash = disposition.closure_hash
     and binding.terminal_outcome = disposition.disposition
    left join rosetta_v2513.extraction_run run
      on disposition.disposition = 'completed'
     and run.id = binding.extraction_run_id
     and run.source_document_id = binding.source_document_id
     and run.source_content_id = binding.source_content_id
     and run.source_content_hash = binding.source_content_hash
     and run.engine_version = binding.engine_version
     and run.rule_set_version = binding.rule_set_version
     and run.configuration_hash = binding.configuration_hash
     and run.output_content_hash = binding.output_content_hash
     and run.run_status = 'completed'
     and run.admissibility_state = 'admissible'
    where disposition.campaign_id = p_campaign_id
  )
  select count(*) into v_invalid
  from disposition_check checked
  where checked.identity_valid is not true
     or checked.exact_source is null
     or checked.exact_attempt is null
     or checked.exact_receipt is null
     or checked.exact_binding is null
     or (checked.disposition = 'completed'
         and checked.exact_completed_run is null);

  select count(*) into v_missing
  from rosetta_replay.replay_source_registry source
  where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id,c.closure_prefix)
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
      where disposition.campaign_id = p_campaign_id
        and disposition.source_registry_id = source.source_registry_id);

  if v_invalid <> 0 or v_missing <> 0 then
    raise exception 'campaign disposition truth failure: invalid %, missing %',
      v_invalid,v_missing using errcode = 'P1T04';
  end if;

  perform rosetta_replay.replay_closure_no_source_identity_gate(
    c.closure_prefix);

  return jsonb_build_object(
    'gate','passed',
    'contract','truthful-global-compatibility-v1',
    'campaign_id',p_campaign_id,
    'campaign_state',c.campaign_state,
    'source_replay_result',c.replay_result,
    'source_total',(progress->>'source_total')::bigint,
    'accounted_sources',(progress->>'accounted_sources')::bigint,
    'completed_sources',(progress->>'completed_sources')::bigint,
    'rejected_sources',(progress->>'rejected_sources')::bigint,
    'deferred_sources',(progress->>'deferred_sources')::bigint,
    'timed_out_sources',(progress->>'timed_out_sources')::bigint,
    'retry_exhausted_sources',(progress->>'retry_exhausted_sources')::bigint,
    'failed_terminal_sources',(progress->>'failed_terminal_sources')::bigint,
    'prior_admissible_sources',v_prior_admissible,
    'prior_admissible_noncompleted',v_prior_admissible_noncompleted,
    'candidate_compatible',true,
    'all_sources_parsed',
      (progress->>'completed_sources')::bigint =
        (progress->>'source_total')::bigint,
    'per_source_exceptions',false,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'closure_prefix',c.closure_prefix,
    'closure_hash',v_closure_hash);
end;
$function$;

create or replace function rosetta_replay.seal_truthful_campaign_manifest(
    p_label text,
    p_snapshot_id uuid,
    p_campaign_id uuid)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','public','extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  s rosetta_replay.corpus_snapshot_receipt%rowtype;
  gate_result jsonb;
  v_manifest uuid;
  v_existing_count integer;
  v_count integer;
  v_bytes bigint;
  v_membership_hash text;
  v_manifest_hash text;
  v_auth_variants integer;
  v_bad bigint;
  v_current_engine text;
  v_current_rules text;
begin
  if length(btrim(coalesce(p_label,''))) < 10 then
    raise exception 'truthful manifest label must contain at least 10 characters'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock_shared(20260901,2);
  lock table public.extraction_run in share mode;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  gate_result := rosetta_replay.replay_campaign_truth_gate(p_campaign_id);

  select * into strict s
  from rosetta_replay.corpus_snapshot_receipt
  where snapshot_id = p_snapshot_id;

  select registry.engine_version,registry.rule_set_version
    into strict v_current_engine,v_current_rules
  from public.rosetta_current_generation_registry_v1 registry
  where registry.singleton
  for share;

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
    and auth.engine_version = c.engine_version
    and auth.rule_set_version = c.rule_set_version
    and auth.closure_prefix = c.closure_prefix
    and auth.closure_hash = rosetta_replay.closure_sha256(c.closure_prefix)
    and auth.authorization_scope = 'full_candidate_generation';

  if v_count is distinct from s.source_count
     or v_bytes is distinct from s.source_total_bytes
     or v_membership_hash is distinct from s.source_membership_sha256
     or v_auth_variants <> 1 then
    raise exception 'campaign authorization differs from immutable snapshot membership'
      using errcode = 'P1T11';
  end if;

  -- Every exact production-admissible control must also exist byte-for-byte in
  -- the candidate mirror so completed members can be fully diffed.
  select count(*) into v_bad
  from rosetta_replay.candidate_generation_authorization auth
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = auth.source_registry_id
  join rosetta_v2513.source_document_content content
    on content.source_content_id = source.source_content_id
   and content.source_content_hash = source.source_content_hash
  join lateral (
    select production.*
    from public.extraction_run production
    where production.source_document_id = content.source_document_id
      and production.source_content_id = source.source_content_id
      and production.source_content_hash = source.source_content_hash
      and production.engine_version = v_current_engine
      and production.rule_set_version = v_current_rules
      and production.run_status = 'completed'
      and production.admissibility_state = 'admissible'
      and production.output_content_hash is not null
    order by production.created_at desc,production.id desc
    limit 1
  ) control on true
  left join rosetta_v2513.extraction_run candidate_control
    on candidate_control.id = control.id
   and candidate_control.source_document_id = control.source_document_id
   and candidate_control.source_content_id = control.source_content_id
   and candidate_control.source_content_hash = control.source_content_hash
   and candidate_control.engine_version = control.engine_version
   and candidate_control.rule_set_version = control.rule_set_version
   and candidate_control.output_content_hash = control.output_content_hash
   and candidate_control.run_status = 'completed'
   and candidate_control.admissibility_state = 'admissible'
  where auth.snapshot_id = p_snapshot_id
    and auth.engine_version = c.engine_version
    and auth.rule_set_version = c.rule_set_version
    and auth.closure_prefix = c.closure_prefix
    and auth.closure_hash = rosetta_replay.closure_sha256(c.closure_prefix)
    and auth.authorization_scope = 'full_candidate_generation'
    and candidate_control.id is null;
  if v_bad <> 0 then
    raise exception '% current-generation controls are absent from the candidate mirror',
      v_bad using errcode = 'P1T11';
  end if;

  select count(*),
         (array_agg(manifest.manifest_id order by manifest.manifest_id))[1]
    into v_existing_count,v_manifest
  from rosetta_replay.sealed_corpus_manifest manifest
  where manifest.creation_receipt->>'contract' =
          'truthful-campaign-manifest-v1'
    and manifest.creation_receipt->>'snapshot_id' = p_snapshot_id::text
    and manifest.creation_receipt->>'campaign_id' = p_campaign_id::text;
  if v_existing_count > 1 then
    raise exception 'multiple truthful manifests exist for one snapshot/campaign'
      using errcode = 'P1T11';
  elsif v_existing_count = 1 then
    if not rosetta_replay.verify_sealed_manifest(v_manifest) then
      raise exception 'existing truthful manifest fails immutable recomputation'
        using errcode = 'P1T11';
    end if;
    if exists (
      select 1
      from rosetta_replay.sealed_corpus_manifest existing
      where existing.manifest_id = v_manifest
        and (
          existing.creation_receipt->>'current_production_engine_version'
            is distinct from v_current_engine
          or existing.creation_receipt->>'current_production_rule_set_version'
            is distinct from v_current_rules)) then
      raise exception 'existing truthful manifest was sealed against a different production generation'
        using errcode = 'P1T11';
    end if;
    return v_manifest;
  end if;

  with prepared as (
    select source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           source.source_byte_length,
           disposition.disposition observed_outcome,
           disposition.failure_code observed_failure_code,
           control.control_run_id,
           case when control.control_run_id is null
             then 'none'::text else 'admissible'::text end prior_output_state
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
    join rosetta_replay.replay_campaign_source_disposition disposition
      on disposition.campaign_id = p_campaign_id
     and disposition.source_registry_id = source.source_registry_id
    join rosetta_v2513.source_document_content content
      on content.source_content_id = source.source_content_id
     and content.source_content_hash = source.source_content_hash
    left join lateral (
      select candidate_control.id control_run_id
      from public.extraction_run production
      join rosetta_v2513.extraction_run candidate_control
        on candidate_control.id = production.id
       and candidate_control.source_document_id = production.source_document_id
       and candidate_control.source_content_id = production.source_content_id
       and candidate_control.source_content_hash = production.source_content_hash
       and candidate_control.engine_version = production.engine_version
       and candidate_control.rule_set_version = production.rule_set_version
       and candidate_control.output_content_hash = production.output_content_hash
       and candidate_control.run_status = 'completed'
       and candidate_control.admissibility_state = 'admissible'
      where production.source_document_id = content.source_document_id
        and production.source_content_id = source.source_content_id
        and production.source_content_hash = source.source_content_hash
        and production.engine_version = v_current_engine
        and production.rule_set_version = v_current_rules
        and production.run_status = 'completed'
        and production.admissibility_state = 'admissible'
        and production.output_content_hash is not null
      order by production.created_at desc,production.id desc
      limit 1
    ) control on true
    where auth.snapshot_id = p_snapshot_id
      and auth.engine_version = c.engine_version
      and auth.rule_set_version = c.rule_set_version
      and auth.closure_prefix = c.closure_prefix
      and auth.closure_hash = rosetta_replay.closure_sha256(c.closure_prefix)
      and auth.authorization_scope = 'full_candidate_generation'
  ), hashed as (
    select prepared.*,
      encode(extensions.digest(convert_to(jsonb_build_object(
        'contract','truthful-observed-member-v1',
        'snapshot_id',p_snapshot_id,
        'campaign_id',p_campaign_id,
        'source_registry_id',source_registry_id,
        'source_content_id',source_content_id,
        'source_content_hash',source_content_hash,
        'byte_length',source_byte_length,
        'observed_terminal_outcome',observed_outcome,
        'observed_failure_code',observed_failure_code,
        'prior_output_state',prior_output_state,
        'control_run_id',control_run_id)::text,'UTF8'),'sha256'),'hex')
        expectation_sha256
    from prepared
  )
  select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      source_content_id::text,source_content_hash,source_byte_length::text,
      observed_outcome,coalesce(observed_failure_code,''),prior_output_state,
      coalesce(control_run_id::text,''),false::text,expectation_sha256),chr(10)
      order by source_content_hash,source_content_id),''),'UTF8'),'sha256'),'hex')
    into v_manifest_hash
  from hashed;

  insert into rosetta_replay.sealed_corpus_manifest (
    label,watermark,member_count,total_bytes,manifest_sha256,
    expected_tallies,creation_receipt)
  values (
    btrim(p_label),s.source_created_watermark,v_count,v_bytes,v_manifest_hash,
    jsonb_build_object(
      'completed',(gate_result->>'completed_sources')::bigint,
      'rejected',(gate_result->>'rejected_sources')::bigint,
      'deferred_oversized',(gate_result->>'deferred_sources')::bigint),
    jsonb_build_object(
      'contract','truthful-campaign-manifest-v1',
      'snapshot_id',p_snapshot_id,
      'campaign_id',p_campaign_id,
      'engine_version',c.engine_version,
      'rule_set_version',c.rule_set_version,
      'closure_prefix',c.closure_prefix,
      'closure_hash',rosetta_replay.closure_sha256(c.closure_prefix),
      'current_production_engine_version',v_current_engine,
      'current_production_rule_set_version',v_current_rules,
      'membership_rule','exact immutable snapshot authorization',
      'source_outcome_semantics','observed_not_expected',
      'compatibility_rule',
        'production-admissible sources must complete; unsupported sources may reject or deterministically defer',
      'per_source_exceptions',false,
      'created_by',current_user,
      'created_at',clock_timestamp()))
  returning manifest_id into v_manifest;

  with prepared as (
    select source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           source.source_byte_length,
           disposition.disposition observed_outcome,
           disposition.failure_code observed_failure_code,
           control.control_run_id,
           case when control.control_run_id is null
             then 'none'::text else 'admissible'::text end prior_output_state
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
    join rosetta_replay.replay_campaign_source_disposition disposition
      on disposition.campaign_id = p_campaign_id
     and disposition.source_registry_id = source.source_registry_id
    join rosetta_v2513.source_document_content content
      on content.source_content_id = source.source_content_id
     and content.source_content_hash = source.source_content_hash
    left join lateral (
      select candidate_control.id control_run_id
      from public.extraction_run production
      join rosetta_v2513.extraction_run candidate_control
        on candidate_control.id = production.id
       and candidate_control.source_document_id = production.source_document_id
       and candidate_control.source_content_id = production.source_content_id
       and candidate_control.source_content_hash = production.source_content_hash
       and candidate_control.engine_version = production.engine_version
       and candidate_control.rule_set_version = production.rule_set_version
       and candidate_control.output_content_hash = production.output_content_hash
       and candidate_control.run_status = 'completed'
       and candidate_control.admissibility_state = 'admissible'
      where production.source_document_id = content.source_document_id
        and production.source_content_id = source.source_content_id
        and production.source_content_hash = source.source_content_hash
        and production.engine_version = v_current_engine
        and production.rule_set_version = v_current_rules
        and production.run_status = 'completed'
        and production.admissibility_state = 'admissible'
        and production.output_content_hash is not null
      order by production.created_at desc,production.id desc
      limit 1
    ) control on true
    where auth.snapshot_id = p_snapshot_id
      and auth.engine_version = c.engine_version
      and auth.rule_set_version = c.rule_set_version
      and auth.closure_prefix = c.closure_prefix
      and auth.closure_hash = rosetta_replay.closure_sha256(c.closure_prefix)
      and auth.authorization_scope = 'full_candidate_generation'
  ), hashed as (
    select prepared.*,
      encode(extensions.digest(convert_to(jsonb_build_object(
        'contract','truthful-observed-member-v1',
        'snapshot_id',p_snapshot_id,
        'campaign_id',p_campaign_id,
        'source_registry_id',source_registry_id,
        'source_content_id',source_content_id,
        'source_content_hash',source_content_hash,
        'byte_length',source_byte_length,
        'observed_terminal_outcome',observed_outcome,
        'observed_failure_code',observed_failure_code,
        'prior_output_state',prior_output_state,
        'control_run_id',control_run_id)::text,'UTF8'),'sha256'),'hex')
        expectation_sha256
    from prepared
  )
  insert into rosetta_replay.sealed_corpus_member (
    manifest_id,ordinal,source_registry_id,source_content_id,
    source_content_hash,byte_length,expected_terminal_outcome,
    expected_failure_code,prior_output_state,control_run_id,
    quarantine_required,expectation_sha256)
  select v_manifest,
         row_number() over (order by source_content_hash,source_content_id),
         source_registry_id,source_content_id,source_content_hash,
         source_byte_length,observed_outcome,observed_failure_code,
         prior_output_state,control_run_id,false,expectation_sha256
  from hashed
  order by source_content_hash,source_content_id;

  if not rosetta_replay.verify_sealed_manifest(v_manifest) then
    raise exception 'new truthful manifest failed immutable recomputation'
      using errcode = 'P1T11';
  end if;
  return v_manifest;
end;
$function$;

create or replace function rosetta_replay.truthful_campaign_promotion_gate(
    p_manifest_id uuid,
    p_campaign_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  c rosetta_replay.replay_campaign%rowtype;
  manifest rosetta_replay.sealed_corpus_manifest%rowtype;
  truth_gate jsonb;
  identity_gate jsonb;
  v_closure_hash text;
  v_bad bigint;
  v_required_tests integer;
  v_prior_members bigint;
  v_diff_receipts bigint;
  v_diff_rows bigint;
  v_current_engine text;
  v_current_rules text;
begin
  perform pg_advisory_xact_lock(20260901,2);
  lock table public.extraction_run in share mode;

  select registry.engine_version,registry.rule_set_version
    into strict v_current_engine,v_current_rules
  from public.rosetta_current_generation_registry_v1 registry
  where registry.singleton
  for share;

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id
  for share;
  select * into strict manifest
  from rosetta_replay.sealed_corpus_manifest
  where manifest_id = p_manifest_id
  for share;

  truth_gate := rosetta_replay.replay_campaign_truth_gate(p_campaign_id);
  v_closure_hash := rosetta_replay.closure_sha256(c.closure_prefix);
  identity_gate :=
    rosetta_replay.replay_closure_no_source_identity_gate(c.closure_prefix);

  if not rosetta_replay.verify_sealed_manifest(p_manifest_id)
     or manifest.member_count <= 0
     or manifest.creation_receipt->>'contract' <>
          'truthful-campaign-manifest-v1'
     or manifest.creation_receipt->>'campaign_id' <> p_campaign_id::text
     or manifest.creation_receipt->>'engine_version' <> c.engine_version
     or manifest.creation_receipt->>'rule_set_version' <> c.rule_set_version
     or manifest.creation_receipt->>'closure_prefix' <> c.closure_prefix
     or manifest.creation_receipt->>'closure_hash' <> v_closure_hash
     or manifest.creation_receipt->>'current_production_engine_version'
          is distinct from v_current_engine
     or manifest.creation_receipt->>'current_production_rule_set_version'
          is distinct from v_current_rules
     or manifest.creation_receipt->>'source_outcome_semantics' <>
          'observed_not_expected'
     or (manifest.creation_receipt->>'per_source_exceptions')::boolean
          is distinct from false
     or manifest.member_count is distinct from
          (truth_gate->>'source_total')::integer
     or manifest.expected_tallies is distinct from jsonb_build_object(
          'completed',(truth_gate->>'completed_sources')::bigint,
          'rejected',(truth_gate->>'rejected_sources')::bigint,
          'deferred_oversized',(truth_gate->>'deferred_sources')::bigint) then
    raise exception 'manifest is not the exact truthful campaign contract'
      using errcode = 'P1T24';
  end if;

  -- Exact set equality and exact observed-outcome equality. A rejected source
  -- remains rejected in the sealed evidence; it is never rewritten as passed.
  select count(*) into v_bad
  from rosetta_replay.replay_source_registry source
  left join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = source.source_registry_id
  left join rosetta_replay.sealed_corpus_member member
    on member.manifest_id = p_manifest_id
   and member.source_registry_id = source.source_registry_id
   and member.source_content_id = source.source_content_id
   and member.source_content_hash = source.source_content_hash
   and member.byte_length = source.source_byte_length
   and member.expected_terminal_outcome = disposition.disposition
   and member.expected_failure_code is not distinct from disposition.failure_code
   and not member.quarantine_required
  where rosetta_replay.replay_campaign_source_eligible(
      source.source_registry_id,c.closure_prefix)
    and (disposition.source_registry_id is null
      or member.source_registry_id is null);
  if v_bad <> 0 then
    raise exception '% sources are absent or inexact in the truthful manifest',v_bad
      using errcode = 'P1T24';
  end if;

  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member member
  left join rosetta_replay.replay_source_registry source
    on source.source_registry_id = member.source_registry_id
   and source.source_content_id = member.source_content_id
   and source.source_content_hash = member.source_content_hash
   and source.source_byte_length = member.byte_length
  left join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = p_campaign_id
   and disposition.source_registry_id = member.source_registry_id
   and disposition.disposition = member.expected_terminal_outcome
   and disposition.failure_code is not distinct from
       member.expected_failure_code
  where member.manifest_id = p_manifest_id
    and (
      source.source_registry_id is null
      or not rosetta_replay.replay_campaign_source_eligible(
        member.source_registry_id,c.closure_prefix)
      or disposition.source_registry_id is null
      or member.quarantine_required);
  if v_bad <> 0 then
    raise exception '% manifest members are outside the exact observed campaign set',v_bad
      using errcode = 'P1T24';
  end if;

  -- Freeze and recompute the exact public-generation baseline. If the current
  -- generation, an admissible control, or its candidate mirror changed after
  -- sealing, this manifest is stale and must not authorize publication.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member member
  join rosetta_replay.replay_source_registry source
    on source.source_registry_id = member.source_registry_id
   and source.source_content_id = member.source_content_id
   and source.source_content_hash = member.source_content_hash
   and source.source_byte_length = member.byte_length
  join rosetta_v2513.source_document_content content
    on content.source_content_id = source.source_content_id
   and content.source_content_hash = source.source_content_hash
  left join lateral (
    select production.*
    from public.extraction_run production
    where production.source_document_id = content.source_document_id
      and production.source_content_id = source.source_content_id
      and production.source_content_hash = source.source_content_hash
      and production.engine_version = v_current_engine
      and production.rule_set_version = v_current_rules
      and production.run_status = 'completed'
      and production.admissibility_state = 'admissible'
      and production.output_content_hash is not null
    order by production.created_at desc,production.id desc
    limit 1
  ) control on true
  left join rosetta_v2513.extraction_run candidate_control
    on candidate_control.id = control.id
   and candidate_control.source_document_id = control.source_document_id
   and candidate_control.source_content_id = control.source_content_id
   and candidate_control.source_content_hash = control.source_content_hash
   and candidate_control.engine_version = control.engine_version
   and candidate_control.rule_set_version = control.rule_set_version
   and candidate_control.output_content_hash = control.output_content_hash
   and candidate_control.run_status = 'completed'
   and candidate_control.admissibility_state = 'admissible'
  where member.manifest_id = p_manifest_id
    and (
      (control.id is null and (
        member.prior_output_state <> 'none'
        or member.control_run_id is not null))
      or
      (control.id is not null and (
        member.prior_output_state <> 'admissible'
        or member.control_run_id is distinct from control.id
        or candidate_control.id is null)));
  if v_bad <> 0 then
    raise exception '% manifest members have a stale or inexact production baseline',v_bad
      using errcode = 'P1T24';
  end if;

  select count(*) into v_required_tests
  from rosetta_replay.universal_validation_requirement requirement
  where requirement.engine_version = c.engine_version
    and requirement.rule_set_version = c.rule_set_version
    and requirement.closure_hash = v_closure_hash;
  if v_required_tests = 0 then
    raise exception 'candidate identity has no immutable global validation contract'
      using errcode = 'P1T25';
  end if;

  -- Every completed source, whether newly supported or previously supported,
  -- must be a clean admissible run with all globally required validations.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member member
  where member.manifest_id = p_manifest_id
    and member.expected_terminal_outcome = 'completed'
    and not exists (
      select 1
      from rosetta_replay.replay_campaign_source_disposition disposition
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
       and run.source_document_id = binding.source_document_id
       and run.source_content_id = binding.source_content_id
       and run.source_content_hash = binding.source_content_hash
       and run.engine_version = binding.engine_version
       and run.rule_set_version = binding.rule_set_version
       and run.configuration_hash = binding.configuration_hash
       and run.output_content_hash = binding.output_content_hash
       and run.run_status = 'completed'
       and run.admissibility_state = 'admissible'
      where disposition.campaign_id = p_campaign_id
        and disposition.source_registry_id = member.source_registry_id
        and disposition.disposition = 'completed'
        and exists (
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
        and not exists (
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
        and not exists (
          select 1
          from rosetta_v2513.validation_result validation
          where validation.extraction_run_id = run.id
            and (validation.test_result <> 'pass'
              or coalesce(validation.failure_count,0) <> 0))
        and not exists (
          select 1
          from rosetta_v2513.rosetta_structural_repair_queue repair
          where repair.extraction_run_id = run.id
            and repair.repair_state = 'open'));
  if v_bad <> 0 then
    raise exception '% completed candidate members fail clean-run validation',v_bad
      using errcode = 'P1T25';
  end if;

  select count(*) into v_prior_members
  from rosetta_replay.sealed_corpus_member member
  where member.manifest_id = p_manifest_id
    and member.prior_output_state = 'admissible'
    and member.expected_terminal_outcome = 'completed';

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
    raise exception 'complete exact diff receipts % differ from prior-admissible members %',
      v_diff_receipts,v_prior_members using errcode = 'P1T26';
  end if;

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
    raise exception '% object-field diffs violate global no-regression semantics',v_bad
      using errcode = 'P1T26';
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
    'contract','truthful-global-promotion-v1',
    'scope','immutable_authorized_corpus',
    'manifest_id',p_manifest_id,
    'campaign_id',p_campaign_id,
    'source_count',manifest.member_count,
    'completed_sources',(truth_gate->>'completed_sources')::bigint,
    'rejected_sources',(truth_gate->>'rejected_sources')::bigint,
    'deferred_sources',(truth_gate->>'deferred_sources')::bigint,
    'timed_out_sources',0,
    'retry_exhausted_sources',0,
    'failed_terminal_sources',0,
    'all_sources_parsed',(truth_gate->>'all_sources_parsed')::boolean,
    'source_replay_result',truth_gate->>'source_replay_result',
    'candidate_compatible',true,
    'engine_version',c.engine_version,
    'rule_set_version',c.rule_set_version,
    'closure_prefix',c.closure_prefix,
    'closure_hash',v_closure_hash,
    'required_validation_tests',v_required_tests,
    'prior_admissible_members',v_prior_members,
    'complete_diff_receipts',v_diff_receipts,
    'object_field_diff_rows',v_diff_rows,
    'regressions',0,
    'unexplained_changes',0,
    'per_source_exceptions',false,
    'truth_gate',truth_gate,
    'source_identity_gate',identity_gate);
end;
$function$;

revoke all on function
  rosetta_replay.replay_campaign_truth_gate(uuid),
  rosetta_replay.seal_truthful_campaign_manifest(text,uuid,uuid),
  rosetta_replay.truthful_campaign_promotion_gate(uuid,uuid)
  from public,anon,authenticated,service_role;

grant execute on function
  rosetta_replay.replay_campaign_truth_gate(uuid),
  rosetta_replay.seal_truthful_campaign_manifest(text,uuid,uuid),
  rosetta_replay.truthful_campaign_promotion_gate(uuid,uuid)
  to postgres;

commit;
