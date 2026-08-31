-- ============================================================================
-- Migration 19 -- full-corpus replay contract repair.
--
-- The original bounded fixture path assumed every source already had an
-- immutable expectation.  That is circular for a real corpus: the exact
-- captured 2.5.11 closure must first characterize sources which have never
-- been run by 2.5.11, and only then may its committed binding be converted
-- into an immutable 2.5.13 expectation.
--
-- The supplied quarantine evidence is run-level and spans 2.5.0--2.5.12.
-- Several source bodies have more than one quarantined run, and rejected
-- controls intentionally cannot be stored in sealed_corpus_member.control_run_id.
-- G10 therefore needs an exact run -> source -> flagged member proof rather
-- than the impossible one-run-per-member equality used by migration 14.
--
-- This migration is forward-only.  It does not publish a candidate, update a
-- public registry, or alter any public object.
-- ============================================================================

-- Computing a closure hash expands and hashes every function definition.  A
-- per-source replay must not repeat that catalog-wide work tens of thousands
-- of times.  Preserve the original recomputation function for promotion-time
-- drift proof and cache the exact installed identities for replay execution.
do $block$
begin
  if to_regprocedure('rosetta_replay.recompute_closure_sha256(text)') is null then
    alter function rosetta_replay.closure_sha256(text)
      rename to recompute_closure_sha256;
  end if;
end;
$block$;

create table if not exists rosetta_replay.installed_closure_identity (
  closure_prefix text primary key
    check (closure_prefix ~ '^(ctl_|c[1-7]_|v2513_)$'),
  closure_sha256 text not null check (closure_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default clock_timestamp()
);

insert into rosetta_replay.installed_closure_identity(closure_prefix,closure_sha256)
select p,rosetta_replay.recompute_closure_sha256(p)
from unnest(array['ctl_','c1_','c2_','c3_','c4_','c5_','c6_','c7_','v2513_']) p
on conflict(closure_prefix) do nothing;

do $block$
begin
  if exists(
    select 1 from rosetta_replay.installed_closure_identity i
    where i.closure_sha256 is distinct from
      rosetta_replay.recompute_closure_sha256(i.closure_prefix)
  ) then
    raise exception 'installed closure identity differs from current function catalog'
      using errcode='P1R14';
  end if;
end;
$block$;

create or replace function rosetta_replay.reject_closure_identity_mutation()
returns trigger language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
begin
  raise exception 'installed_closure_identity_is_immutable'
    using errcode='raise_exception';
end;
$fn$;
drop trigger if exists installed_closure_identity_immutable
  on rosetta_replay.installed_closure_identity;
create trigger installed_closure_identity_immutable
  before update or delete on rosetta_replay.installed_closure_identity
  for each row execute function rosetta_replay.reject_closure_identity_mutation();

create or replace function rosetta_replay.closure_sha256(p_closure_prefix text)
returns text language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare v_hash text;
begin
  select i.closure_sha256 into v_hash
  from rosetta_replay.installed_closure_identity i
  where i.closure_prefix=p_closure_prefix;
  if v_hash is null then
    raise exception 'invalid or uncaptured closure prefix: %',p_closure_prefix
      using errcode='22023';
  end if;
  return v_hash;
end;
$fn$;

alter table rosetta_replay.installed_closure_identity enable row level security;
revoke all on table rosetta_replay.installed_closure_identity
  from public,anon,authenticated;
revoke all on function rosetta_replay.recompute_closure_sha256(text)
  from public,anon,authenticated;
revoke all on function rosetta_replay.closure_sha256(text)
  from public,anon,authenticated;
revoke all on function rosetta_replay.reject_closure_identity_mutation()
  from public,anon,authenticated;

-- Historical database text containing U+FFFD must remain registerable so it
-- cannot disappear from the sealed corpus.  Registration records the observed
-- defect; the 2.5.13 charset gate still rejects it unless a real
-- manual_verified_literal receipt exists.
create or replace function rosetta_replay.register_source(
    p_source_content_id   uuid,
    p_source_content_hash text,
    p_source_byte_length  bigint,
    p_charset_receipt     jsonb)
returns uuid language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay'
as $fn$
declare
  v_id uuid;
  v_replacement_count integer;
  v_disposition text;
begin
  if p_source_content_hash is null or p_source_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'source_content_hash must be a lowercase sha256 hex digest'
      using errcode = '22023';
  end if;
  if p_source_byte_length is null or p_source_byte_length < 0 then
    raise exception 'source_byte_length must be nonnegative' using errcode = '22023';
  end if;
  if p_charset_receipt is null
     or nullif(p_charset_receipt->>'source_charset','') is null
     or nullif(p_charset_receipt->>'decoding_method','') is null
     or not (p_charset_receipt ? 'invalid_byte_handling')
     or not (p_charset_receipt ? 'replacement_char_count')
     or not (p_charset_receipt ? 'replacement_chars_block_span_certainty')
     or (p_charset_receipt->>'replacement_char_count') !~ '^[0-9]+$' then
    raise exception 'charset_receipt must record source_charset, decoding_method, invalid_byte_handling, replacement_char_count, and replacement_chars_block_span_certainty'
      using errcode = '22023';
  end if;

  v_replacement_count := (p_charset_receipt->>'replacement_char_count')::integer;
  v_disposition := p_charset_receipt->>'replacement_char_disposition';
  if v_replacement_count > 0
     and (v_disposition is null
          or v_disposition not in ('manual_verified_literal','unverified_replacement_detected')) then
    raise exception 'replacement characters require either manual_verified_literal or unverified_replacement_detected disposition'
      using errcode = '22023';
  end if;
  if v_replacement_count > 0
     and coalesce((p_charset_receipt->>'replacement_chars_block_span_certainty')::boolean,true) then
    raise exception 'replacement characters must explicitly block span certainty'
      using errcode = '22023';
  end if;

  insert into rosetta_replay.replay_source_registry
    (source_content_id, source_content_hash, source_byte_length, charset_receipt)
  values (p_source_content_id, p_source_content_hash,
          p_source_byte_length, p_charset_receipt)
  on conflict (source_content_id, source_content_hash) do nothing
  returning source_registry_id into v_id;
  if v_id is null then
    select r.source_registry_id into v_id
    from rosetta_replay.replay_source_registry r
    where r.source_content_id = p_source_content_id
      and r.source_content_hash = p_source_content_hash;
  end if;
  return v_id;
end;
$fn$;

-- Permit expectation-free claims only for the byte-faithful 2.5.11 control.
-- All lanes and the composed 2.5.13 candidate still require a previously
-- declared immutable expectation.
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
        v_has_expectation boolean;
begin
  select exists(
    select 1 from rosetta_replay.source_replay_expectation
    where source_registry_id=p_source_registry_id
  ) into v_has_expectation;

  if not v_has_expectation and not (
       p_closure_prefix='ctl_'
       and p_engine_version='rosetta-v3-deterministic-sql-2.5.11'
       and p_rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
     ) then
    raise exception 'source % has no immutable replay expectation',p_source_registry_id
      using errcode='P1R12';
  end if;
  if p_closure_prefix='ctl_' and (
       p_engine_version is distinct from 'rosetta-v3-deterministic-sql-2.5.11'
       or p_rule_set_version is distinct from 'rosetta-five-layer-structural-correctness-2.5.11'
     ) then
    raise exception 'control characterization requires the exact 2.5.11 engine and rule set'
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

-- Finalization normally enforces a declared immutable expectation.  The only
-- exception is an exact ctl_/2.5.11 characterization attempt; its committed
-- binding becomes the authority from which the expectation is derived later.
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
  v_binding text;v_receipt uuid;v_has_expectation boolean;
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
  select * into e from rosetta_replay.source_replay_expectation
  where source_registry_id=a.source_registry_id;
  v_has_expectation:=found;
  if not v_has_expectation and not (
       a.engine_version='rosetta-v3-deterministic-sql-2.5.11'
       and a.rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
       and a.closure_hash=rosetta_replay.closure_sha256('ctl_')
     ) then
    raise exception 'expectation-free finalization is restricted to exact 2.5.11 control characterization'
      using errcode='P1R28';
  end if;
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
    return rosetta_replay.finalize_attempt(p_attempt_id,a.pending_outcome,
      a.pending_sqlstate,a.pending_error_detail,p_worker_identity,a.pending_payload);
  end if;

  if v_has_expectation and (
       e.expected_terminal_outcome is distinct from v_terminal
       or (v_terminal='rejected' and e.expected_failure_code is distinct from v_failure)
     ) then
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

-- Convert one exact committed 2.5.11 control binding into the immutable
-- candidate expectation.  Engine-versioned failure codes are mapped only
-- across the known v2511 -> v2513 identity token.  Unverified replacement
-- characters are retained as exact P1A07 policy rejections and have no
-- admissible prior-output baseline.
create or replace function rosetta_replay.declare_source_expectation_from_control(
    p_source_registry_id uuid,
    p_control_attempt_id uuid,
    p_rationale text default 'Exact 2.5.11 control characterization for full-corpus replay')
returns text language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $fn$
declare
  r rosetta_replay.replay_source_registry%rowtype;
  b rosetta_replay.replay_run_binding%rowtype;
  v_expected text;
  v_failure text;
  v_prior text;
  v_control_run integer;
  v_quarantine boolean;
  v_replacements integer;
  v_disposition text;
begin
  select * into strict r from rosetta_replay.replay_source_registry
  where source_registry_id=p_source_registry_id;
  select * into strict b from rosetta_replay.replay_run_binding
  where attempt_id=p_control_attempt_id
    and source_registry_id=p_source_registry_id
    and source_content_id=r.source_content_id
    and source_content_hash=r.source_content_hash
    and engine_version='rosetta-v3-deterministic-sql-2.5.11'
    and rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
    and closure_hash=rosetta_replay.closure_sha256('ctl_');

  v_replacements:=(r.charset_receipt->>'replacement_char_count')::integer;
  v_disposition:=coalesce(r.charset_receipt->>'replacement_char_disposition','undispositioned');
  if v_replacements>0 and v_disposition<>'manual_verified_literal' then
    v_expected:='rejected';
    v_failure:='P1A07';
    v_prior:='none';
    v_control_run:=null;
  elsif b.terminal_outcome='completed' then
    if b.extraction_run_id is null or b.output_content_hash is null then
      raise exception 'completed control binding lacks an exact run/output identity'
        using errcode='P1B01';
    end if;
    v_expected:='completed';
    v_failure:=null;
    v_prior:='admissible';
    v_control_run:=b.extraction_run_id;
  elsif b.terminal_outcome='rejected' then
    v_expected:='rejected';
    v_failure:=case
      when b.failure_code in ('rosetta_v2511_post_base_failure',
                              'rosetta_v2511_final_validation_failed')
        then replace(b.failure_code,'v2511','v2513')
      else b.failure_code
    end;
    v_prior:='none';
    v_control_run:=null;
  else
    raise exception 'control characterization outcome % cannot seed a candidate expectation',
      b.terminal_outcome using errcode='P1B06';
  end if;

  select exists(
    select 1
    from rosetta_replay.quarantine_control_run q
    join rosetta_v2513.extraction_run qr on qr.id=q.control_run_id
    where qr.source_content_id=r.source_content_id
      and qr.source_content_hash=r.source_content_hash
  ) into v_quarantine;

  return rosetta_replay.declare_source_expectation(
    p_source_registry_id,v_expected,v_failure,v_prior,v_control_run,
    v_quarantine,p_rationale);
end;
$fn$;

-- Immutable receipt for the private, watermark-bound source snapshot used by
-- the full replay.  The caller supplies only the label and source watermark;
-- counts and hashes are computed from the imported exact candidate rows.
create table if not exists rosetta_replay.corpus_snapshot_receipt (
  snapshot_id uuid primary key default gen_random_uuid(),
  snapshot_label text not null unique,
  source_created_watermark timestamptz not null,
  source_count integer not null check(source_count>0),
  source_total_bytes bigint not null check(source_total_bytes>0),
  source_membership_sha256 text not null
    check(source_membership_sha256~'^[0-9a-f]{64}$'),
  quarantine_set_id text not null,
  quarantine_run_count integer not null check(quarantine_run_count>0),
  quarantine_membership_sha256 text not null
    check(quarantine_membership_sha256~'^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by text not null default current_user
);

create or replace function rosetta_replay.record_corpus_snapshot(
    p_snapshot_label text,
    p_source_created_watermark timestamptz,
    p_quarantine_set_id text)
returns uuid language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  v_id uuid;v_count integer;v_bytes bigint;v_hash text;
  v_q_count integer;v_q_expected integer;v_q_hash text;
begin
  if length(btrim(coalesce(p_snapshot_label,'')))<10 then
    raise exception 'snapshot label must contain at least 10 characters'
      using errcode='22023';
  end if;
  if exists(
    select 1 from rosetta_v2513.source_document_content
    where created_at>p_source_created_watermark
  ) then
    raise exception 'private source snapshot contains rows after its declared watermark'
      using errcode='P1B07';
  end if;
  select count(*)::integer,
         coalesce(sum(octet_length(convert_to(source_text,'UTF8'))),0)::bigint,
         encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
           source_content_id::text,source_content_hash,
           octet_length(convert_to(source_text,'UTF8'))::text),chr(10)
           order by source_content_hash,source_content_id),''),'UTF8'),'sha256'),'hex')
  into v_count,v_bytes,v_hash
  from rosetta_v2513.source_document_content;
  if v_count=0 then
    raise exception 'private source snapshot is empty' using errcode='P1B07';
  end if;

  select expected_run_count into v_q_expected
  from rosetta_replay.quarantine_evidence_set
  where quarantine_set_id=p_quarantine_set_id;
  select count(*)::integer,
         encode(extensions.digest(convert_to(coalesce(string_agg(control_run_id::text,','
           order by control_run_id),''),'UTF8'),'sha256'),'hex')
  into v_q_count,v_q_hash
  from rosetta_replay.quarantine_control_run
  where quarantine_set_id=p_quarantine_set_id;
  if v_q_expected is null or v_q_count is distinct from v_q_expected then
    raise exception 'quarantine evidence is missing or count-incomplete for snapshot receipt'
      using errcode='P1G20';
  end if;

  insert into rosetta_replay.corpus_snapshot_receipt(
    snapshot_label,source_created_watermark,source_count,source_total_bytes,
    source_membership_sha256,quarantine_set_id,quarantine_run_count,
    quarantine_membership_sha256)
  values(btrim(p_snapshot_label),p_source_created_watermark,v_count,v_bytes,v_hash,
    p_quarantine_set_id,v_q_count,v_q_hash)
  returning snapshot_id into v_id;
  return v_id;
end;
$fn$;

create or replace function rosetta_replay.reject_snapshot_receipt_mutation()
returns trigger language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
begin
  raise exception 'corpus_snapshot_receipt_is_immutable'
    using errcode='raise_exception';
end;
$fn$;
drop trigger if exists corpus_snapshot_receipt_immutable
  on rosetta_replay.corpus_snapshot_receipt;
create trigger corpus_snapshot_receipt_immutable
  before update or delete on rosetta_replay.corpus_snapshot_receipt
  for each row execute function rosetta_replay.reject_snapshot_receipt_mutation();

-- Batch helpers keep claim, execute, and finalize in different committed API
-- calls while avoiding one network round-trip per source.  A batch transaction
-- contains only one phase, never multiple phases for the same attempt.
create or replace function rosetta_replay.replay_claim_batch(
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_worker_identity text,
    p_limit integer default 100)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare
  s record;v_attempt uuid;v_state text;v_hash text;v_config text;
  v_selected integer:=0;v_running integer:=0;v_terminal integer:=0;
begin
  if p_limit<1 or p_limit>1000 then
    raise exception 'batch limit must be between 1 and 1000' using errcode='22023';
  end if;
  v_hash:=rosetta_replay.closure_sha256(p_closure_prefix);
  for s in
    select r.source_registry_id,r.source_content_hash,r.source_content_id
    from rosetta_replay.replay_source_registry r
    where (p_closure_prefix='ctl_' or exists(
             select 1 from rosetta_replay.source_replay_expectation e
             where e.source_registry_id=r.source_registry_id))
      and not exists(
        select 1 from rosetta_replay.replay_run_binding b
        where b.source_registry_id=r.source_registry_id
          and b.engine_version=p_engine_version
          and b.rule_set_version=p_rule_set_version
          and b.closure_hash=v_hash)
    order by r.source_content_hash,r.source_content_id
    limit p_limit
  loop
    v_selected:=v_selected+1;
    v_config:=rosetta_replay.expected_configuration_hash(s.source_registry_id);
    v_attempt:=rosetta_replay.replay_claim(
      s.source_registry_id,p_closure_prefix,p_engine_version,p_rule_set_version,
      v_config,v_hash,p_worker_identity,interval '15 minutes');
    select attempt_state into v_state from rosetta_replay.replay_attempt
    where attempt_id=v_attempt;
    if v_state='running' then v_running:=v_running+1;
    else v_terminal:=v_terminal+1; end if;
  end loop;
  return jsonb_build_object('phase','claim','selected',v_selected,
    'running',v_running,'already_terminal_without_binding',v_terminal,
    'closure_prefix',p_closure_prefix,'closure_hash',v_hash);
end;
$fn$;

create or replace function rosetta_replay.replay_execute_batch(
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_worker_identity text,
    p_limit integer default 25,
    p_timeout_ms integer default 120000)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare
  a record;v_hash text;v_result jsonb;v_count integer:=0;v_tallies jsonb:='{}'::jsonb;
  v_outcome text;
begin
  if p_limit<1 or p_limit>250 then
    raise exception 'execute batch limit must be between 1 and 250' using errcode='22023';
  end if;
  v_hash:=rosetta_replay.closure_sha256(p_closure_prefix);
  for a in
    select attempt_id
    from rosetta_replay.replay_attempt
    where engine_version=p_engine_version and rule_set_version=p_rule_set_version
      and closure_hash=v_hash and attempt_state='running'
      and pending_outcome is null
      and worker_identity is not distinct from p_worker_identity
    order by claimed_at,attempt_id
    limit p_limit
  loop
    v_result:=rosetta_replay.replay_execute(a.attempt_id,p_closure_prefix,p_timeout_ms);
    v_outcome:=coalesce(v_result->>'pending_outcome','<null>');
    v_tallies:=jsonb_set(v_tallies,array[v_outcome],
      to_jsonb(coalesce((v_tallies->>v_outcome)::integer,0)+1),true);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('phase','execute','processed',v_count,
    'pending_outcomes',v_tallies,'closure_prefix',p_closure_prefix,
    'closure_hash',v_hash);
end;
$fn$;

create or replace function rosetta_replay.replay_finalize_batch(
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_worker_identity text,
    p_limit integer default 100)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare
  a record;v_hash text;v_count integer:=0;v_tallies jsonb:='{}'::jsonb;
  v_state text;
begin
  if p_limit<1 or p_limit>1000 then
    raise exception 'finalize batch limit must be between 1 and 1000' using errcode='22023';
  end if;
  v_hash:=rosetta_replay.closure_sha256(p_closure_prefix);
  for a in
    select attempt_id
    from rosetta_replay.replay_attempt
    where engine_version=p_engine_version and rule_set_version=p_rule_set_version
      and closure_hash=v_hash and attempt_state='running'
      and pending_outcome is not null
      and worker_identity is not distinct from p_worker_identity
    order by claimed_at,attempt_id
    limit p_limit
  loop
    perform rosetta_replay.replay_finalize(a.attempt_id,p_worker_identity);
    select attempt_state into v_state from rosetta_replay.replay_attempt
    where attempt_id=a.attempt_id;
    v_tallies:=jsonb_set(v_tallies,array[v_state],
      to_jsonb(coalesce((v_tallies->>v_state)::integer,0)+1),true);
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('phase','finalize','processed',v_count,
    'terminal_states',v_tallies,'closure_prefix',p_closure_prefix,
    'closure_hash',v_hash);
end;
$fn$;

create or replace function rosetta_replay.declare_control_expectations_batch(
    p_limit integer default 1000)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare
  x record;v_count integer:=0;v_hash text;
begin
  if p_limit<1 or p_limit>5000 then
    raise exception 'expectation batch limit must be between 1 and 5000'
      using errcode='22023';
  end if;
  v_hash:=rosetta_replay.closure_sha256('ctl_');
  for x in
    select r.source_registry_id,b.attempt_id
    from rosetta_replay.replay_source_registry r
    join lateral (
      select b.attempt_id
      from rosetta_replay.replay_run_binding b
      where b.source_registry_id=r.source_registry_id
        and b.engine_version='rosetta-v3-deterministic-sql-2.5.11'
        and b.rule_set_version='rosetta-five-layer-structural-correctness-2.5.11'
        and b.closure_hash=v_hash
      order by b.bound_at desc,b.attempt_id
      limit 1
    ) b on true
    where not exists(
      select 1 from rosetta_replay.source_replay_expectation e
      where e.source_registry_id=r.source_registry_id)
    order by r.source_content_hash,r.source_content_id
    limit p_limit
  loop
    perform rosetta_replay.declare_source_expectation_from_control(
      x.source_registry_id,x.attempt_id,
      'Exact 2.5.11 control characterization for watermark-bound full-corpus replay');
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('declared',v_count,'control_closure_hash',v_hash);
end;
$fn$;

-- Exact G10 verifier.  The immutable evidence remains 1,038 run IDs; each ID
-- must exist as the same historical 2.5.x run and bind to the exact source
-- identity of a quarantine-flagged member.  Multiple run IDs for one source
-- are expected and proven rather than collapsed.
create or replace function rosetta_replay.verify_quarantine_evidence(
    p_manifest_id uuid,
    p_quarantine_set_id text)
returns jsonb language plpgsql stable
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513'
as $fn$
declare
  v_expected integer;
  v_loaded integer;
  v_missing_run integer;
  v_bad_engine integer;
  v_unbound integer;
  v_overflagged integer;
  v_sources integer;
begin
  select expected_run_count into v_expected
  from rosetta_replay.quarantine_evidence_set
  where quarantine_set_id=p_quarantine_set_id;
  if v_expected is null then
    raise exception 'gate G10: quarantine evidence set missing' using errcode='P1G20';
  end if;
  select count(*) into v_loaded
  from rosetta_replay.quarantine_control_run
  where quarantine_set_id=p_quarantine_set_id;
  if v_loaded<>v_expected then
    raise exception 'gate G10: quarantine set count % differs from declared %',v_loaded,v_expected
      using errcode='P1G20';
  end if;

  select count(*) into v_missing_run
  from rosetta_replay.quarantine_control_run q
  where q.quarantine_set_id=p_quarantine_set_id
    and not exists(
      select 1 from rosetta_v2513.extraction_run r
      where r.id=q.control_run_id and r.source_content_id is not null
        and r.source_content_hash is not null
    );
  if v_missing_run>0 then
    raise exception 'gate G10: % quarantined run IDs are absent or source-unbound in the imported control snapshot',v_missing_run
      using errcode='P1G20';
  end if;

  select count(*) into v_bad_engine
  from rosetta_replay.quarantine_control_run q
  join rosetta_v2513.extraction_run r on r.id=q.control_run_id
  where q.quarantine_set_id=p_quarantine_set_id
    and r.engine_version !~ '^rosetta-v3-deterministic-sql-2[.]5[.]([0-9]+)$';
  if v_bad_engine>0 then
    raise exception 'gate G10: % quarantined runs are outside the declared 2.5.x lineage',v_bad_engine
      using errcode='P1G20';
  end if;

  select count(*) into v_unbound
  from rosetta_replay.quarantine_control_run q
  join rosetta_v2513.extraction_run r on r.id=q.control_run_id
  where q.quarantine_set_id=p_quarantine_set_id
    and not exists(
      select 1
      from rosetta_replay.sealed_corpus_member m
      where m.manifest_id=p_manifest_id
        and m.source_content_id=r.source_content_id
        and m.source_content_hash=r.source_content_hash
        and m.quarantine_required
    );
  if v_unbound>0 then
    raise exception 'gate G10: % quarantined runs lack an exact-source quarantine-flagged manifest member',v_unbound
      using errcode='P1G20';
  end if;

  select count(*) into v_overflagged
  from rosetta_replay.sealed_corpus_member m
  where m.manifest_id=p_manifest_id and m.quarantine_required
    and not exists(
      select 1
      from rosetta_replay.quarantine_control_run q
      join rosetta_v2513.extraction_run r on r.id=q.control_run_id
      where q.quarantine_set_id=p_quarantine_set_id
        and r.source_content_id=m.source_content_id
        and r.source_content_hash=m.source_content_hash
    );
  if v_overflagged>0 then
    raise exception 'gate G10: % manifest members are quarantine-flagged without run-level evidence',v_overflagged
      using errcode='P1G20';
  end if;

  select count(distinct r.source_content_id) into v_sources
  from rosetta_replay.quarantine_control_run q
  join rosetta_v2513.extraction_run r on r.id=q.control_run_id
  where q.quarantine_set_id=p_quarantine_set_id;

  return jsonb_build_object(
    'gate','G10','status','passed','quarantine_set_id',p_quarantine_set_id,
    'run_count',v_loaded,'distinct_source_count',v_sources);
end;
$fn$;

-- Keep the repaired replay-control API private after migration 18's lockdown.
revoke all on function rosetta_replay.register_source(uuid,text,bigint,jsonb)
  from public,anon,authenticated;
revoke all on function rosetta_replay.replay_claim(uuid,text,text,text,text,text,text,interval)
  from public,anon,authenticated;
revoke all on function rosetta_replay.replay_finalize(uuid,text)
  from public,anon,authenticated;
revoke all on function rosetta_replay.declare_source_expectation_from_control(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function rosetta_replay.verify_quarantine_evidence(uuid,text)
  from public,anon,authenticated;
alter table rosetta_replay.corpus_snapshot_receipt enable row level security;
revoke all on table rosetta_replay.corpus_snapshot_receipt
  from public,anon,authenticated;
revoke all on function rosetta_replay.record_corpus_snapshot(text,timestamptz,text)
  from public,anon,authenticated;
revoke all on function rosetta_replay.reject_snapshot_receipt_mutation()
  from public,anon,authenticated;
revoke all on function rosetta_replay.replay_claim_batch(text,text,text,text,integer)
  from public,anon,authenticated;
revoke all on function rosetta_replay.replay_execute_batch(text,text,text,text,integer,integer)
  from public,anon,authenticated;
revoke all on function rosetta_replay.replay_finalize_batch(text,text,text,text,integer)
  from public,anon,authenticated;
revoke all on function rosetta_replay.declare_control_expectations_batch(integer)
  from public,anon,authenticated;
