-- ============================================================================
-- Universal manifest and evidence-derived diffs
--
-- A promotable manifest has one rule for every authorized member: completed.
-- Historical control availability is measured from the current generation;
-- no source receives an expected rejection, expected deferral, or correction
-- label. Diff classification follows the observed defect transition only.
-- ============================================================================

do $preflight$
begin
  if to_regclass('rosetta_replay.replay_campaign_source_disposition') is null
     or to_regclass('rosetta_replay.sealed_corpus_manifest') is null
     or to_regclass('rosetta_replay.member_diff_receipt') is null
     or to_regclass('rosetta_replay.object_diff') is null then
    raise exception 'universal manifest requires replay truth and diff substrates'
      using errcode = 'P1C05';
  end if;
end;
$preflight$;

alter table rosetta_replay.sealed_corpus_manifest
  drop constraint if exists sealed_corpus_manifest_nonempty_check;
alter table rosetta_replay.sealed_corpus_manifest
  add constraint sealed_corpus_manifest_nonempty_check
  check (member_count > 0 and total_bytes >= 0);

comment on table rosetta_replay.regression_disposition is
  'Deprecated historical evidence only. Universal promotion never accepts a regression through a per-diff disposition.';

create or replace function rosetta_replay.lock_global_promotion_evidence_write()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  perform pg_advisory_xact_lock_shared(20260901,1);
  return null;
end;
$function$;

create or replace function rosetta_replay.guard_sealed_member_insert()
returns trigger
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
declare
  v_member_count integer;
  v_existing integer;
begin
  perform pg_advisory_xact_lock_shared(20260901,1);
  select manifest.member_count into strict v_member_count
  from rosetta_replay.sealed_corpus_manifest manifest
  where manifest.manifest_id = new.manifest_id;

  if new.ordinal < 1 or new.ordinal > v_member_count then
    raise exception 'manifest member ordinal % is outside 1..%',
      new.ordinal,v_member_count using errcode = 'P1G11';
  end if;
  select count(*) into v_existing
  from rosetta_replay.sealed_corpus_member member
  where member.manifest_id = new.manifest_id;
  if v_existing >= v_member_count then
    raise exception 'sealed manifest % already contains all % declared members',
      new.manifest_id,v_member_count using errcode = 'P1G11';
  end if;
  return new;
end;
$function$;

drop trigger if exists sealed_manifest_evidence_write_lock
  on rosetta_replay.sealed_corpus_manifest;
create trigger sealed_manifest_evidence_write_lock
before insert on rosetta_replay.sealed_corpus_manifest
for each statement execute function rosetta_replay.lock_global_promotion_evidence_write();

drop trigger if exists sealed_member_evidence_write_guard
  on rosetta_replay.sealed_corpus_member;
create trigger sealed_member_evidence_write_guard
before insert on rosetta_replay.sealed_corpus_member
for each row execute function rosetta_replay.guard_sealed_member_insert();

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

-- The old entry point encoded a different expected outcome per source. It is
-- retained only as a loud compatibility stop.
create or replace function rosetta_replay.seal_corpus(
    p_label text,
    p_watermark timestamptz,
    p_oversized_byte_threshold bigint default null,
    p_source_registry_ids uuid[] default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $function$
begin
  raise exception 'per-source expected-outcome manifests are disabled; use seal_universal_campaign_manifest'
    using errcode = 'P1G11';
end;
$function$;

create or replace function rosetta_replay.seal_universal_campaign_manifest(
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
    raise exception 'universal manifest label must contain at least 10 characters'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock_shared(20260901,1);

  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = p_campaign_id;
  perform rosetta_replay.replay_campaign_universal_gate(p_campaign_id);

  select * into strict s
  from rosetta_replay.corpus_snapshot_receipt
  where snapshot_id = p_snapshot_id;

  select registry.engine_version,registry.rule_set_version
    into strict v_current_engine,v_current_rules
  from public.rosetta_current_generation_registry_v1 registry
  where registry.singleton;

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
      using errcode = 'P1G11';
  end if;

  -- If the current public generation has an admissible exact control run, the
  -- candidate schema must contain the same run identity for complete diffing.
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
    raise exception '% current-generation control runs are absent or inexact in the candidate schema',v_bad
      using errcode = 'P1G11';
  end if;

  select count(*),
         (array_agg(manifest.manifest_id order by manifest.manifest_id))[1]
    into v_existing_count,v_manifest
  from rosetta_replay.sealed_corpus_manifest manifest
  where manifest.creation_receipt->>'contract' =
          'universal-campaign-manifest-v1'
    and manifest.creation_receipt->>'snapshot_id' = p_snapshot_id::text
    and manifest.creation_receipt->>'campaign_id' = p_campaign_id::text;
  if v_existing_count > 1 then
    raise exception 'multiple universal manifests exist for one snapshot/campaign'
      using errcode = 'P1G11';
  elsif v_existing_count = 1 then
    if not rosetta_replay.verify_sealed_manifest(v_manifest) then
      raise exception 'existing universal manifest fails immutable recomputation'
        using errcode = 'P1G11';
    end if;
    return v_manifest;
  end if;

  with prepared as (
    select source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           source.source_byte_length,
           control.control_run_id,
           case when control.control_run_id is null
             then 'none'::text else 'admissible'::text end prior_output_state
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
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
        'contract','universal-corpus-member-v1',
        'snapshot_id',p_snapshot_id,
        'campaign_id',p_campaign_id,
        'source_registry_id',source_registry_id,
        'source_content_id',source_content_id,
        'source_content_hash',source_content_hash,
        'byte_length',source_byte_length,
        'required_terminal_outcome','completed',
        'prior_output_state',prior_output_state,
        'control_run_id',control_run_id)::text,'UTF8'),'sha256'),'hex')
        expectation_sha256
    from prepared
  )
  select encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
      source_content_id::text,source_content_hash,source_byte_length::text,
      'completed','',prior_output_state,coalesce(control_run_id::text,''),
      false::text,expectation_sha256),chr(10)
      order by source_content_hash,source_content_id),''),'UTF8'),'sha256'),'hex')
    into v_manifest_hash
  from hashed;

  insert into rosetta_replay.sealed_corpus_manifest (
    label,watermark,member_count,total_bytes,manifest_sha256,
    expected_tallies,creation_receipt)
  values (
    btrim(p_label),s.source_created_watermark,v_count,v_bytes,v_manifest_hash,
    jsonb_build_object('completed',v_count),
    jsonb_build_object(
      'contract','universal-campaign-manifest-v1',
      'snapshot_id',p_snapshot_id,
      'campaign_id',p_campaign_id,
      'engine_version',c.engine_version,
      'rule_set_version',c.rule_set_version,
      'closure_prefix',c.closure_prefix,
      'closure_hash',rosetta_replay.closure_sha256(c.closure_prefix),
      'membership_rule','exact immutable snapshot authorization',
      'required_terminal_outcome','completed',
      'per_source_exceptions',false,
      'created_by',current_user,
      'created_at',clock_timestamp()))
  returning manifest_id into v_manifest;

  with prepared as (
    select source.source_registry_id,
           source.source_content_id,
           source.source_content_hash,
           source.source_byte_length,
           control.control_run_id,
           case when control.control_run_id is null
             then 'none'::text else 'admissible'::text end prior_output_state
    from rosetta_replay.candidate_generation_authorization auth
    join rosetta_replay.replay_source_registry source
      on source.source_registry_id = auth.source_registry_id
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
        'contract','universal-corpus-member-v1',
        'snapshot_id',p_snapshot_id,
        'campaign_id',p_campaign_id,
        'source_registry_id',source_registry_id,
        'source_content_id',source_content_id,
        'source_content_hash',source_content_hash,
        'byte_length',source_byte_length,
        'required_terminal_outcome','completed',
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
         source_byte_length,'completed',null,prior_output_state,control_run_id,
         false,expectation_sha256
  from hashed
  order by source_content_hash,source_content_id;

  if not rosetta_replay.verify_sealed_manifest(v_manifest) then
    raise exception 'new universal manifest failed immutable recomputation'
      using errcode = 'P1G11';
  end if;
  return v_manifest;
end;
$function$;

-- The correction-id argument remains for signature compatibility but has no
-- authority. Classification is derived solely from the two observed states.
create or replace function rosetta_replay.classify_diff(
    p_control_value text,
    p_candidate_value text,
    p_correction_id text,
    p_control_defect text,
    p_candidate_defect text)
returns text
language plpgsql immutable
set search_path to 'pg_catalog','rosetta_replay'
as $function$
begin
  if p_control_value is not distinct from p_candidate_value
     and p_control_defect is not distinct from p_candidate_defect then
    return 'unchanged';
  end if;
  if p_control_defect is not null and p_candidate_defect is null then
    return 'improvement_declared';
  end if;
  if p_control_value is not null and p_candidate_value is null then
    return 'regression';
  end if;
  if p_control_value is null and p_candidate_value is not null then
    return 'unexplained';
  end if;
  if rosetta_replay.plain_normalize(p_control_value)
       is not distinct from rosetta_replay.plain_normalize(p_candidate_value)
     and p_candidate_defect is null then
    return 'neutral_relabel';
  end if;
  if p_candidate_defect is not null then
    return 'regression';
  end if;
  return 'unexplained';
end;
$function$;

create or replace function rosetta_replay.diff_member(
    p_manifest_id uuid,
    p_source_registry_id uuid,
    p_candidate_attempt_id uuid,
    p_correction_id text default null)
returns uuid
language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $function$
declare
  manifest rosetta_replay.sealed_corpus_manifest%rowtype;
  m rosetta_replay.sealed_corpus_member%rowtype;
  b rosetta_replay.replay_run_binding%rowtype;
  c rosetta_replay.replay_campaign%rowtype;
  v_campaign_id uuid;
  v_control_count integer;
  v_candidate_count integer;
  v_union_count integer;
  v_diff_count integer;
  v_hash text;
  v_existing uuid;
begin
  if nullif(btrim(coalesce(p_correction_id,'')),'') is not null then
    raise exception 'per-source correction labels are disabled'
      using errcode = 'P1D05';
  end if;
  perform pg_advisory_xact_lock_shared(20260901,1);

  select * into strict manifest
  from rosetta_replay.sealed_corpus_manifest
  where manifest_id = p_manifest_id;
  if manifest.creation_receipt->>'contract' <>
       'universal-campaign-manifest-v1'
     or coalesce(manifest.creation_receipt->>'campaign_id','') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'diff requires a universal campaign manifest'
      using errcode = 'P1D05';
  end if;
  v_campaign_id := (manifest.creation_receipt->>'campaign_id')::uuid;
  select * into strict c
  from rosetta_replay.replay_campaign
  where campaign_id = v_campaign_id;

  select * into strict m
  from rosetta_replay.sealed_corpus_member
  where manifest_id = p_manifest_id
    and source_registry_id = p_source_registry_id;
  if m.expected_terminal_outcome <> 'completed'
     or m.expected_failure_code is not null
     or m.prior_output_state <> 'admissible'
     or m.control_run_id is null then
    raise exception 'member % has no exact prior admissible output to diff',
      p_source_registry_id using errcode = 'P1D01';
  end if;

  select binding.* into strict b
  from rosetta_replay.replay_run_binding binding
  join rosetta_replay.replay_campaign_source_disposition disposition
    on disposition.campaign_id = v_campaign_id
   and disposition.source_registry_id = p_source_registry_id
   and disposition.attempt_id = binding.attempt_id
   and disposition.disposition = 'completed'
  where binding.attempt_id = p_candidate_attempt_id
    and binding.source_registry_id = p_source_registry_id
    and binding.source_content_id = m.source_content_id
    and binding.source_content_hash = m.source_content_hash
    and binding.engine_version = c.engine_version
    and binding.rule_set_version = c.rule_set_version
    and binding.configuration_hash =
      rosetta_replay.expected_configuration_hash(p_source_registry_id)
    and binding.closure_hash = rosetta_replay.closure_sha256(c.closure_prefix)
    and binding.terminal_outcome = 'completed';

  select source_registry_id into v_existing
  from rosetta_replay.member_diff_receipt
  where manifest_id = p_manifest_id
    and source_registry_id = p_source_registry_id
    and candidate_attempt_id = p_candidate_attempt_id;
  if found then
    return v_existing;
  end if;

  with control as (
    select *
    from rosetta_replay.run_object_field_snapshot(m.control_run_id)
  ), candidate as (
    select *
    from rosetta_replay.run_object_field_snapshot(b.extraction_run_id)
  ), joined as (
    select coalesce(control.object_type,candidate.object_type) object_type,
           coalesce(control.object_locator,candidate.object_locator)
             object_locator,
           coalesce(control.field,candidate.field) field,
           control.field_value control_value,
           candidate.field_value candidate_value,
           control.field_defect control_defect,
           candidate.field_defect candidate_defect
    from control
    full join candidate using(object_type,object_locator,field)
  )
  insert into rosetta_replay.object_diff (
    manifest_id,source_registry_id,control_run_id,candidate_attempt_id,
    candidate_run_id,object_type,object_locator,field,control_value,
    candidate_value,control_defect,candidate_defect,status,correction_id,
    engine_version,rule_set_version,configuration_hash,closure_hash)
  select p_manifest_id,p_source_registry_id,m.control_run_id,
         p_candidate_attempt_id,b.extraction_run_id,
         joined.object_type,joined.object_locator,joined.field,
         joined.control_value,joined.candidate_value,
         joined.control_defect,joined.candidate_defect,
         rosetta_replay.classify_diff(
           joined.control_value,joined.candidate_value,null,
           joined.control_defect,joined.candidate_defect),
         null,b.engine_version,b.rule_set_version,
         b.configuration_hash,b.closure_hash
  from joined;

  select count(*) into v_control_count
  from rosetta_replay.run_object_field_snapshot(m.control_run_id);
  select count(*) into v_candidate_count
  from rosetta_replay.run_object_field_snapshot(b.extraction_run_id);
  select count(*) into v_union_count
  from (
    select object_type,object_locator,field
    from rosetta_replay.run_object_field_snapshot(m.control_run_id)
    union
    select object_type,object_locator,field
    from rosetta_replay.run_object_field_snapshot(b.extraction_run_id)
  ) fields;

  select count(*),
         encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
           object_type,object_locator,field,coalesce(control_value,'<NULL>'),
           coalesce(candidate_value,'<NULL>'),coalesce(control_defect,''),
           coalesce(candidate_defect,''),status,''),chr(10)
           order by object_type,object_locator,field),''),'UTF8'),'sha256'),'hex')
    into v_diff_count,v_hash
  from rosetta_replay.object_diff
  where manifest_id = p_manifest_id
    and source_registry_id = p_source_registry_id
    and candidate_attempt_id = p_candidate_attempt_id;

  insert into rosetta_replay.member_diff_receipt (
    manifest_id,source_registry_id,candidate_attempt_id,control_run_id,
    candidate_run_id,control_field_count,candidate_field_count,
    union_field_count,diff_row_count,complete,diff_sha256)
  values (
    p_manifest_id,p_source_registry_id,p_candidate_attempt_id,m.control_run_id,
    b.extraction_run_id,v_control_count,v_candidate_count,v_union_count,
    v_diff_count,v_diff_count = v_union_count,v_hash);
  if v_diff_count <> v_union_count then
    raise exception 'diff completeness failure: wrote %, expected union %',
      v_diff_count,v_union_count using errcode = 'P1D03';
  end if;
  return p_source_registry_id;
end;
$function$;

revoke all on function
  rosetta_replay.lock_global_promotion_evidence_write(),
  rosetta_replay.guard_sealed_member_insert(),
  rosetta_replay.seal_corpus(text,timestamptz,bigint,uuid[]),
  rosetta_replay.seal_universal_campaign_manifest(text,uuid,uuid),
  rosetta_replay.classify_diff(text,text,text,text,text),
  rosetta_replay.diff_member(uuid,uuid,uuid,text)
  from public, anon, authenticated;

revoke all on function
  rosetta_replay.seal_corpus(text,timestamptz,bigint,uuid[])
  from service_role;

grant execute on function
  rosetta_replay.lock_global_promotion_evidence_write(),
  rosetta_replay.guard_sealed_member_insert(),
  rosetta_replay.seal_universal_campaign_manifest(text,uuid,uuid),
  rosetta_replay.classify_diff(text,text,text,text,text),
  rosetta_replay.diff_member(uuid,uuid,uuid,text)
  to postgres;
