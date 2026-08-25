-- ============================================================================
-- Migration 11 -- immutable corpus expectations and sealed replay manifest.
--
-- A member is not silently treated as a positive fixture.  Before sealing,
-- every registered source must have exactly one immutable declared outcome:
--   completed | rejected (with exact failure code) | deferred_oversized.
-- Sources with an admissible prior output also bind the exact control run that
-- must be compared.  The declaration and all copied member fields participate
-- in the manifest hash.
-- ============================================================================

create table if not exists rosetta_replay.source_replay_expectation (
    source_registry_id       uuid primary key
        references rosetta_replay.replay_source_registry(source_registry_id),
    expected_terminal_outcome text not null
        check (expected_terminal_outcome in
               ('completed','rejected','deferred_oversized')),
    expected_failure_code    text,
    prior_output_state       text not null
        check (prior_output_state in ('none','admissible')),
    control_run_id           integer,
    quarantine_required      boolean not null default false,
    expectation_rationale    text not null check (length(btrim(expectation_rationale)) >= 10),
    expectation_sha256       text not null check (expectation_sha256 ~ '^[0-9a-f]{64}$'),
    declared_by              text not null default current_user,
    declared_at              timestamptz not null default clock_timestamp(),
    check ((expected_terminal_outcome = 'rejected' and expected_failure_code is not null)
        or (expected_terminal_outcome <> 'rejected' and expected_failure_code is null)),
    check ((prior_output_state = 'admissible' and control_run_id is not null)
        or (prior_output_state = 'none' and control_run_id is null))
);

create or replace function rosetta_replay.reject_expectation_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'source_replay_expectation_is_immutable'
    using errcode = 'raise_exception';
end;
$fn$;

drop trigger if exists source_replay_expectation_immutable
  on rosetta_replay.source_replay_expectation;
create trigger source_replay_expectation_immutable
  before update or delete on rosetta_replay.source_replay_expectation
  for each row execute function rosetta_replay.reject_expectation_mutation();

create or replace function rosetta_replay.declare_source_expectation(
    p_source_registry_id        uuid,
    p_expected_terminal_outcome text,
    p_expected_failure_code     text,
    p_prior_output_state        text,
    p_control_run_id            integer,
    p_quarantine_required       boolean,
    p_rationale                 text)
returns text language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay', 'rosetta_v2513', 'extensions'
as $fn$
declare
  v_registry rosetta_replay.replay_source_registry%rowtype;
  v_content rosetta_v2513.source_document_content%rowtype;
  v_run rosetta_v2513.extraction_run%rowtype;
  v_hash text;
  v_existing text;
begin
  if p_expected_terminal_outcome not in
       ('completed','rejected','deferred_oversized') then
    raise exception 'invalid expected terminal outcome: %', p_expected_terminal_outcome
      using errcode = '22023';
  end if;
  if p_prior_output_state not in ('none','admissible') then
    raise exception 'invalid prior output state: %', p_prior_output_state
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_rationale,''))) < 10 then
    raise exception 'expectation rationale must contain at least 10 characters'
      using errcode = '22023';
  end if;
  if (p_expected_terminal_outcome = 'rejected') <> (p_expected_failure_code is not null) then
    raise exception 'rejected expectations require one exact failure code; other outcomes forbid it'
      using errcode = '22023';
  end if;

  select * into strict v_registry
  from rosetta_replay.replay_source_registry
  where source_registry_id = p_source_registry_id;

  select * into strict v_content
  from rosetta_v2513.source_document_content
  where source_content_id = v_registry.source_content_id
    and source_content_hash = v_registry.source_content_hash;

  if p_prior_output_state = 'admissible' then
    if p_control_run_id is null then
      raise exception 'an admissible prior output requires control_run_id'
        using errcode = '22023';
    end if;
    select * into strict v_run
    from rosetta_v2513.extraction_run
    where id = p_control_run_id;
    if v_run.source_content_id is distinct from v_registry.source_content_id
       or v_run.source_document_id is distinct from v_content.source_document_id
       or v_run.source_content_hash is distinct from v_registry.source_content_hash
       or v_run.run_status <> 'completed'
       or v_run.admissibility_state <> 'admissible'
       or v_run.output_content_hash is null then
      raise exception 'control_run_source_binding_invalid: run % does not prove this exact source',
        p_control_run_id using errcode = 'P1B01';
    end if;
  elsif p_control_run_id is not null then
    raise exception 'prior_output_state none forbids a control run'
      using errcode = '22023';
  end if;
  -- The immutable quarantine evidence is installed later by migration 14.
  -- Gate G10 verifies that every listed run is present and marked.  Do not
  -- create a forward dependency here: migration 11 must apply cleanly before
  -- the quarantine tables exist.

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'source_registry_id', p_source_registry_id,
      'source_content_id', v_registry.source_content_id,
      'source_content_hash', v_registry.source_content_hash,
      'expected_terminal_outcome', p_expected_terminal_outcome,
      'expected_failure_code', p_expected_failure_code,
      'prior_output_state', p_prior_output_state,
      'control_run_id', p_control_run_id,
      'quarantine_required', coalesce(p_quarantine_required,false),
      'rationale', btrim(p_rationale)
    )::text,'UTF8'),'sha256'),'hex');

  insert into rosetta_replay.source_replay_expectation
    (source_registry_id, expected_terminal_outcome, expected_failure_code,
     prior_output_state, control_run_id, quarantine_required,
     expectation_rationale, expectation_sha256)
  values
    (p_source_registry_id, p_expected_terminal_outcome, p_expected_failure_code,
     p_prior_output_state, p_control_run_id, coalesce(p_quarantine_required,false),
     btrim(p_rationale), v_hash)
  on conflict (source_registry_id) do nothing;

  select expectation_sha256 into v_existing
  from rosetta_replay.source_replay_expectation
  where source_registry_id = p_source_registry_id;
  if v_existing is distinct from v_hash then
    raise exception 'source expectation already exists with different immutable content'
      using errcode = '23505';
  end if;
  return v_hash;
end;
$fn$;

create table if not exists rosetta_replay.sealed_corpus_manifest (
    manifest_id        uuid primary key default gen_random_uuid(),
    label              text not null,
    watermark          timestamptz not null,
    member_count       integer not null,
    total_bytes        bigint not null,
    manifest_sha256    text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    expected_tallies   jsonb not null,
    creation_receipt   jsonb not null,
    created_at         timestamptz not null default clock_timestamp()
);

create table if not exists rosetta_replay.sealed_corpus_member (
    manifest_id              uuid not null
        references rosetta_replay.sealed_corpus_manifest(manifest_id),
    ordinal                  integer not null,
    source_registry_id       uuid not null
        references rosetta_replay.replay_source_registry(source_registry_id),
    source_content_id        uuid not null,
    source_content_hash      text not null,
    byte_length              bigint not null,
    expected_terminal_outcome text not null,
    expected_failure_code    text,
    prior_output_state       text not null,
    control_run_id           integer,
    quarantine_required      boolean not null,
    expectation_sha256       text not null,
    primary key (manifest_id, ordinal),
    unique (manifest_id, source_registry_id)
);

create or replace function rosetta_replay.reject_manifest_mutation()
returns trigger language plpgsql as $fn$
begin
  raise exception 'sealed_corpus_manifest_is_immutable'
    using errcode = 'raise_exception';
end;
$fn$;

drop trigger if exists sealed_manifest_immutable on rosetta_replay.sealed_corpus_manifest;
create trigger sealed_manifest_immutable
  before update or delete on rosetta_replay.sealed_corpus_manifest
  for each row execute function rosetta_replay.reject_manifest_mutation();
drop trigger if exists sealed_member_immutable on rosetta_replay.sealed_corpus_member;
create trigger sealed_member_immutable
  before update or delete on rosetta_replay.sealed_corpus_member
  for each row execute function rosetta_replay.reject_manifest_mutation();

create or replace function rosetta_replay.seal_corpus(
    p_label text,
    p_watermark timestamptz,
    p_oversized_byte_threshold bigint default null,
    p_source_registry_ids uuid[] default null)
returns uuid language plpgsql
set search_path to 'pg_catalog', 'rosetta_replay', 'extensions'
as $fn$
declare
  v_manifest uuid;
  v_missing integer;
  v_bad_deferred integer;
  v_count integer;
  v_bytes bigint;
  v_hash text;
  v_tallies jsonb;
  v_scope_missing integer;
begin
  if p_source_registry_ids is not null then
    if cardinality(p_source_registry_ids)=0
       or cardinality(p_source_registry_ids)<>(select count(distinct x) from unnest(p_source_registry_ids) x) then
      raise exception 'explicit manifest scope must be nonempty and contain unique source ids'
        using errcode='22023';
    end if;
    select count(*) into v_scope_missing
    from unnest(p_source_registry_ids) x(source_registry_id)
    where not exists(select 1 from rosetta_replay.replay_source_registry r
                     where r.source_registry_id=x.source_registry_id
                       and r.registered_at<=p_watermark);
    if v_scope_missing>0 then
      raise exception 'explicit manifest scope contains % missing/post-watermark sources',v_scope_missing
        using errcode='P1B05';
    end if;
  end if;
  select count(*) into v_missing
  from rosetta_replay.replay_source_registry r
  left join rosetta_replay.source_replay_expectation e using (source_registry_id)
  where r.registered_at <= p_watermark
    and (p_source_registry_ids is null or r.source_registry_id=any(p_source_registry_ids))
    and e.source_registry_id is null;
  if v_missing > 0 then
    raise exception 'manifest_expectations_incomplete: % registered sources have no declared terminal outcome',
      v_missing using errcode = 'P1B02';
  end if;

  select count(*) into v_bad_deferred
  from rosetta_replay.replay_source_registry r
  join rosetta_replay.source_replay_expectation e using (source_registry_id)
  where r.registered_at <= p_watermark
    and (p_source_registry_ids is null or r.source_registry_id=any(p_source_registry_ids))
    and ((e.expected_terminal_outcome = 'deferred_oversized'
          and (p_oversized_byte_threshold is null
               or r.source_byte_length <= p_oversized_byte_threshold))
      or (p_oversized_byte_threshold is not null
          and r.source_byte_length > p_oversized_byte_threshold
          and e.expected_terminal_outcome <> 'deferred_oversized'));
  if v_bad_deferred > 0 then
    raise exception 'manifest_deferred_contract_mismatch: % sources disagree with the declared oversized threshold',
      v_bad_deferred using errcode = 'P1B03';
  end if;

  with members as (
    select r.source_registry_id, r.source_content_id, r.source_content_hash,
           r.source_byte_length,e.expected_terminal_outcome,
           e.expected_failure_code,e.prior_output_state,e.control_run_id,
           e.quarantine_required,e.expectation_sha256
    from rosetta_replay.replay_source_registry r
    join rosetta_replay.source_replay_expectation e using (source_registry_id)
    where r.registered_at <= p_watermark
      and (p_source_registry_ids is null or r.source_registry_id=any(p_source_registry_ids))
  ), lines as (
    select *, concat_ws('|',source_content_id::text,source_content_hash,
             source_byte_length::text,expected_terminal_outcome,
             coalesce(expected_failure_code,''),prior_output_state,
             coalesce(control_run_id::text,''),quarantine_required::text,
             expectation_sha256) as member_line
    from members
  )
  select count(*)::integer, coalesce(sum(source_byte_length),0)::bigint,
         encode(extensions.digest(convert_to(coalesce(string_agg(member_line,chr(10)
           order by source_content_hash,source_content_id),''),'UTF8'),'sha256'),'hex')
    into v_count,v_bytes,v_hash
  from lines;

  -- jsonb_object_agg above sees repeated keys; calculate the tally directly.
  select coalesce(jsonb_object_agg(expected_terminal_outcome,cnt),'{}'::jsonb)
    into v_tallies
  from (
    select e.expected_terminal_outcome,count(*)::bigint cnt
    from rosetta_replay.replay_source_registry r
    join rosetta_replay.source_replay_expectation e using (source_registry_id)
    where r.registered_at <= p_watermark
      and (p_source_registry_ids is null or r.source_registry_id=any(p_source_registry_ids))
    group by e.expected_terminal_outcome
  ) s;

  insert into rosetta_replay.sealed_corpus_manifest
    (label,watermark,member_count,total_bytes,manifest_sha256,
     expected_tallies,creation_receipt)
  values
    (p_label,p_watermark,v_count,v_bytes,v_hash,v_tallies,
     jsonb_build_object(
       'created_by',current_user,
       'created_at',clock_timestamp(),
       'membership_rule','all immutable registrations at or before watermark, each with an immutable expectation',
       'scope',case when p_source_registry_ids is null then 'all_at_or_before_watermark' else 'explicit_source_registry_ids' end,
       'explicit_source_count',case when p_source_registry_ids is null then null else cardinality(p_source_registry_ids) end,
       'oversized_byte_threshold',p_oversized_byte_threshold,
       'terminal_outcomes',jsonb_build_array('completed','rejected','deferred_oversized')))
  returning manifest_id into v_manifest;

  insert into rosetta_replay.sealed_corpus_member
    (manifest_id,ordinal,source_registry_id,source_content_id,
     source_content_hash,byte_length,expected_terminal_outcome,
     expected_failure_code,prior_output_state,control_run_id,
     quarantine_required,expectation_sha256)
  select v_manifest,
         row_number() over (order by r.source_content_hash,r.source_content_id),
         r.source_registry_id,r.source_content_id,r.source_content_hash,
         r.source_byte_length,e.expected_terminal_outcome,
         e.expected_failure_code,e.prior_output_state,e.control_run_id,
         e.quarantine_required,e.expectation_sha256
  from rosetta_replay.replay_source_registry r
  join rosetta_replay.source_replay_expectation e using (source_registry_id)
  where r.registered_at <= p_watermark
    and (p_source_registry_ids is null or r.source_registry_id=any(p_source_registry_ids))
  order by r.source_content_hash,r.source_content_id;

  return v_manifest;
end;
$fn$;

create or replace function rosetta_replay.verify_sealed_manifest(p_manifest_id uuid)
returns boolean language sql stable
set search_path to 'pg_catalog', 'rosetta_replay', 'extensions'
as $fn$
  with recalculated as (
    select count(*)::integer member_count,
           coalesce(sum(byte_length),0)::bigint total_bytes,
           encode(extensions.digest(convert_to(coalesce(string_agg(concat_ws('|',
             source_content_id::text,source_content_hash,byte_length::text,
             expected_terminal_outcome,coalesce(expected_failure_code,''),
             prior_output_state,coalesce(control_run_id::text,''),
             quarantine_required::text,expectation_sha256),chr(10)
             order by ordinal),''),'UTF8'),'sha256'),'hex') manifest_sha256
    from rosetta_replay.sealed_corpus_member
    where manifest_id = p_manifest_id
  )
  select exists (
    select 1
    from rosetta_replay.sealed_corpus_manifest m, recalculated c
    where m.manifest_id = p_manifest_id
      and m.member_count = c.member_count
      and m.total_bytes = c.total_bytes
      and m.manifest_sha256 = c.manifest_sha256);
$fn$;
