-- ============================================================================
-- Migration 14 -- exact promotion gates.  No gate accepts a generic receipt,
-- a run from another source, a single token diff, or a same-transaction replay.
-- ============================================================================

create table if not exists rosetta_replay.quarantine_evidence_set (
    quarantine_set_id text primary key,
    source_file_sha256 text not null check(source_file_sha256~'^[0-9a-f]{64}$'),
    expected_run_count integer not null check(expected_run_count>0),
    description text not null,
    loaded_at timestamptz not null default clock_timestamp()
);
create table if not exists rosetta_replay.quarantine_control_run (
    quarantine_set_id text not null references rosetta_replay.quarantine_evidence_set,
    control_run_id integer not null,
    primary key(quarantine_set_id,control_run_id)
);

create table if not exists rosetta_replay.human_authorization (
    authorization_id uuid primary key default gen_random_uuid(),
    scope text not null check(scope in ('promotion','cutover','lane_replay')),
    authorizer text not null,
    authorization_text text not null check(length(btrim(authorization_text))>=10),
    receipt_hash text not null check(receipt_hash~'^[0-9a-f]{64}$'),
    manifest_id uuid,
    engine_version text,
    rule_set_version text,
    configuration_contract_hash text,
    closure_hash text,
    quarantine_set_id text,
    created_at timestamptz not null default clock_timestamp()
);

create table if not exists rosetta_replay.regression_disposition (
    diff_id bigint primary key references rosetta_replay.object_diff(diff_id),
    disposition text not null check(disposition in
      ('accepted_with_evidence','fixed_elsewhere','false_positive')),
    rationale text not null check(length(btrim(rationale))>=20),
    evidence_uri text not null,
    dispositioned_by text not null,
    created_at timestamptz not null default clock_timestamp()
);

create table if not exists rosetta_replay.negative_control_expectation (
    control_name text primary key,
    correction_id text not null check(correction_id in
      ('C1','C2','C3','C4','C5','C6','C7')),
    source_registry_id uuid not null,
    expected_code text not null,
    description text not null check(length(btrim(description))>=10),
    unique(correction_id,source_registry_id,expected_code)
);
create table if not exists rosetta_replay.negative_control_result (
    control_name text not null references rosetta_replay.negative_control_expectation,
    closure_prefix text not null,
    candidate_attempt_id uuid not null references rosetta_replay.replay_attempt,
    observed_code text not null,
    binding_sha256 text not null,
    observed_at timestamptz not null default clock_timestamp(),
    primary key(control_name,closure_prefix)
);

create or replace function rosetta_replay.reject_gate_evidence_mutation()
returns trigger language plpgsql as $fn$
begin raise exception 'promotion_gate_evidence_is_append_only' using errcode='raise_exception'; end;
$fn$;
do $block$
declare v_table text;
begin
  foreach v_table in array array['quarantine_evidence_set','quarantine_control_run',
    'human_authorization','regression_disposition','negative_control_expectation',
    'negative_control_result'] loop
    execute format('drop trigger if exists %I on rosetta_replay.%I',
      v_table||'_immutable',v_table);
    execute format('create trigger %I before update or delete on rosetta_replay.%I '
      'for each row execute function rosetta_replay.reject_gate_evidence_mutation()',
      v_table||'_immutable',v_table);
  end loop;
end;
$block$;

create or replace function rosetta_replay.record_negative_control_result(
    p_control_name text,p_closure_prefix text,p_candidate_attempt_id uuid)
returns text language plpgsql
set search_path to 'pg_catalog','rosetta_replay'
as $fn$
declare e rosetta_replay.negative_control_expectation%rowtype;
        b rosetta_replay.replay_run_binding%rowtype;
begin
  select * into strict e from rosetta_replay.negative_control_expectation
  where control_name=p_control_name;
  select * into strict b from rosetta_replay.replay_run_binding
  where attempt_id=p_candidate_attempt_id and terminal_outcome='rejected';
  if b.source_registry_id is distinct from e.source_registry_id then
    raise exception 'negative control attempt belongs to a different source'
      using errcode='P1G01';
  end if;
  insert into rosetta_replay.negative_control_result
    (control_name,closure_prefix,candidate_attempt_id,observed_code,binding_sha256)
  values(p_control_name,p_closure_prefix,p_candidate_attempt_id,b.failure_code,b.binding_sha256);
  return b.failure_code;
end;
$fn$;

create or replace function rosetta_replay.promotion_gate_check(
    p_manifest_id uuid,
    p_closure_prefix text,
    p_engine_version text,
    p_rule_set_version text,
    p_configuration_contract_hash text,
    p_closure_hash text,
    p_quarantine_set_id text)
returns jsonb language plpgsql
set search_path to 'pg_catalog','rosetta_replay','rosetta_v2513','extensions'
as $fn$
declare
  v_bad bigint;v_unexplained bigint;v_regressions bigint;v_actor_bad bigint;
  v_span_bad bigint;v_candidate_ambiguity bigint;v_control_ambiguity bigint;
  v_published bigint;v_auth bigint;v_quarantine_expected integer;v_quarantine_loaded integer;
begin
  -- G1 immutable manifest.
  if not rosetta_replay.verify_sealed_manifest(p_manifest_id) then
    raise exception 'gate G1: sealed manifest failed recomputation' using errcode='P1G11';
  end if;

  -- G2 every member has its declared terminal outcome at the exact identity.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member m
  where m.manifest_id=p_manifest_id and not exists(
    select 1 from rosetta_replay.replay_run_binding b
    where b.source_registry_id=m.source_registry_id
      and b.source_content_id=m.source_content_id
      and b.source_content_hash=m.source_content_hash
      and b.engine_version=p_engine_version
      and b.rule_set_version=p_rule_set_version
      and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
      and b.closure_hash=p_closure_hash
      and b.terminal_outcome=m.expected_terminal_outcome
      and (m.expected_terminal_outcome<>'rejected'
           or b.failure_code=m.expected_failure_code));
  if v_bad>0 then
    raise exception 'gate G2: % members lack their exact declared terminal binding',v_bad
      using errcode='P1G12';
  end if;

  -- G3 complete per-member diff receipt for every prior admissible output.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member m
  where m.manifest_id=p_manifest_id and m.prior_output_state='admissible'
    and not exists(
      select 1 from rosetta_replay.replay_run_binding b
      join rosetta_replay.member_diff_receipt d
        on d.manifest_id=m.manifest_id and d.source_registry_id=m.source_registry_id
       and d.candidate_attempt_id=b.attempt_id
       and d.control_run_id=m.control_run_id
       and d.candidate_run_id=b.extraction_run_id
       and d.complete and d.diff_row_count=d.union_field_count
      where b.source_registry_id=m.source_registry_id
        and b.source_content_id=m.source_content_id
        and b.source_content_hash=m.source_content_hash
        and b.engine_version=p_engine_version and b.rule_set_version=p_rule_set_version
        and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
        and b.closure_hash=p_closure_hash and b.terminal_outcome='completed');
  if v_bad>0 then
    raise exception 'gate G3: % prior-output members lack complete exact diff receipts',v_bad
      using errcode='P1G13';
  end if;

  -- G4 no unexplained change and no regression without evidence disposition.
  select count(*) into v_unexplained from rosetta_replay.object_diff d
  where d.manifest_id=p_manifest_id and d.engine_version=p_engine_version
    and d.rule_set_version=p_rule_set_version and d.closure_hash=p_closure_hash
    and d.configuration_hash=rosetta_replay.expected_configuration_hash(d.source_registry_id)
    and d.status='unexplained';
  if v_unexplained>0 then raise exception 'gate G4: % unexplained object-field diffs',v_unexplained
    using errcode='P1G14'; end if;
  select count(*) into v_regressions
  from rosetta_replay.object_diff d left join rosetta_replay.regression_disposition x using(diff_id)
  where d.manifest_id=p_manifest_id and d.engine_version=p_engine_version
    and d.rule_set_version=p_rule_set_version and d.closure_hash=p_closure_hash
    and d.configuration_hash=rosetta_replay.expected_configuration_hash(d.source_registry_id)
    and d.status='regression' and x.diff_id is null;
  if v_regressions>0 then raise exception 'gate G4: % regressions lack evidence disposition',v_regressions
    using errcode='P1G14'; end if;

  -- G5 every universal correction lane has at least one declared negative
  -- control, and every declaration is an exact rejected-source binding.
  select count(*) into v_bad
  from (values ('C1'),('C2'),('C3'),('C4'),('C5'),('C6'),('C7')) required(correction_id)
  where not exists(select 1 from rosetta_replay.negative_control_expectation e
                   where e.correction_id=required.correction_id);
  if v_bad>0 then raise exception 'gate G5: % correction lanes lack a declared negative control',v_bad
    using errcode='P1G15'; end if;
  select count(*) into v_bad
  from rosetta_replay.negative_control_expectation e
  left join rosetta_replay.negative_control_result r
    on r.control_name=e.control_name and r.closure_prefix=p_closure_prefix
  left join rosetta_replay.replay_run_binding b on b.attempt_id=r.candidate_attempt_id
  where r.control_name is null or b.attempt_id is null or r.observed_code<>e.expected_code
     or b.source_registry_id<>e.source_registry_id or b.failure_code<>e.expected_code
     or b.engine_version<>p_engine_version or b.rule_set_version<>p_rule_set_version
     or b.closure_hash<>p_closure_hash or b.binding_sha256<>r.binding_sha256;
  if v_bad>0 then raise exception 'gate G5: % negative controls missing or mismatched',v_bad
    using errcode='P1G15'; end if;

  -- G6 universal actor gate over every exact candidate run and every actor-bearing layer.
  select count(*) into v_actor_bad
  from rosetta_replay.sealed_corpus_member m
  join rosetta_replay.replay_run_binding b on b.source_registry_id=m.source_registry_id
    and b.source_content_id=m.source_content_id and b.source_content_hash=m.source_content_hash
    and b.engine_version=p_engine_version and b.rule_set_version=p_rule_set_version
    and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
    and b.closure_hash=p_closure_hash and b.terminal_outcome='completed'
  cross join lateral rosetta_replay.run_object_field_snapshot(b.extraction_run_id) s
  where m.manifest_id=p_manifest_id and s.field='actor' and s.field_defect is not null;
  if v_actor_bad>0 then raise exception 'gate G6: % candidate actor fields violate the universal sanity contract',v_actor_bad
    using errcode='P1G16'; end if;

  -- G7 every object has a span state; ambiguity/unresolved has a repair receipt;
  -- candidate ambiguity cannot exceed the same-source prior baseline (new sources baseline zero).
  select count(*) into v_span_bad
  from rosetta_replay.sealed_corpus_member m
  join rosetta_replay.replay_run_binding b on b.source_registry_id=m.source_registry_id
    and b.source_content_id=m.source_content_id and b.source_content_hash=m.source_content_hash
    and b.engine_version=p_engine_version and b.rule_set_version=p_rule_set_version
    and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
    and b.closure_hash=p_closure_hash and b.terminal_outcome='completed'
  cross join lateral rosetta_replay.run_object_field_snapshot(b.extraction_run_id) s
  where m.manifest_id=p_manifest_id and s.field='span_status'
    and s.field_value is null;
  select v_span_bad + count(*) into v_span_bad
  from rosetta_replay.sealed_corpus_member m
  join rosetta_replay.replay_run_binding b on b.source_registry_id=m.source_registry_id
    and b.source_content_id=m.source_content_id and b.source_content_hash=m.source_content_hash
    and b.engine_version=p_engine_version and b.rule_set_version=p_rule_set_version
    and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
    and b.closure_hash=p_closure_hash and b.terminal_outcome='completed'
  join rosetta_v2513.rosetta_object_source_span s
    on s.extraction_run_id=b.extraction_run_id and s.span_status in ('ambiguous','unresolved')
  where m.manifest_id=p_manifest_id and not exists(
    select 1 from rosetta_v2513.rosetta_structural_repair_queue q
    where q.extraction_run_id=b.extraction_run_id
      and q.object_type=s.object_type and q.object_id=s.object_id
      and q.defect_type=case when s.span_status='ambiguous'
        then 'source_span_ambiguous' else 'source_span_unresolved' end
      and q.repair_state='open');
  if v_span_bad>0 then raise exception 'gate G7: % candidate objects have missing/unreceipted span uncertainty',v_span_bad
    using errcode='P1G17'; end if;
  -- Compare every candidate run with its own member's control baseline.
  -- A new member has no admissible prior output and therefore has baseline zero.
  select count(*) into v_bad
  from rosetta_replay.sealed_corpus_member m
  join rosetta_replay.replay_run_binding b on b.source_registry_id=m.source_registry_id
    and b.source_content_id=m.source_content_id and b.source_content_hash=m.source_content_hash
    and b.engine_version=p_engine_version and b.rule_set_version=p_rule_set_version
    and b.configuration_hash=rosetta_replay.expected_configuration_hash(m.source_registry_id)
    and b.closure_hash=p_closure_hash and b.terminal_outcome='completed'
  where m.manifest_id=p_manifest_id
    and (
      select count(*)
      from rosetta_replay.run_object_field_snapshot(b.extraction_run_id) s
      where s.field='span_status'
        and coalesce(s.field_value,'unresolved') in ('ambiguous','unresolved')
    ) > case
      when m.prior_output_state='admissible' then (
        select count(*)
        from rosetta_replay.run_object_field_snapshot(m.control_run_id) s
        where s.field='span_status'
          and coalesce(s.field_value,'unresolved') in ('ambiguous','unresolved')
      )
      else 0
    end;
  if v_bad>0 then
    raise exception 'gate G7: % source members exceed their same-source ambiguity baseline',v_bad
      using errcode='P1G17';
  end if;

  -- G8 exact closure plus declared configuration contract.
  if p_closure_hash is distinct from rosetta_replay.closure_sha256(p_closure_prefix) then
    raise exception 'gate G8: closure hash mismatch' using errcode='P1G18'; end if;
  if p_configuration_contract_hash is distinct from rosetta_replay.configuration_contract_sha256() then
    raise exception 'gate G8: configuration contract hash mismatch' using errcode='P1G18'; end if;

  -- G9 candidate remains structurally unpublished.
  select count(*) into v_published from rosetta_v2513.rosetta_current_generation_registry_v1
  where engine_version=p_engine_version;
  if v_published>0 then raise exception 'gate G9: candidate has a publication registry row'
    using errcode='P1G19'; end if;

  -- G10 the supplied quarantine evidence set is complete and every listed
  -- prior run is represented by a flagged manifest member with terminal binding.
  select expected_run_count into v_quarantine_expected
  from rosetta_replay.quarantine_evidence_set where quarantine_set_id=p_quarantine_set_id;
  if v_quarantine_expected is null then raise exception 'gate G10: quarantine evidence set missing'
    using errcode='P1G20'; end if;
  select count(*) into v_quarantine_loaded from rosetta_replay.quarantine_control_run
  where quarantine_set_id=p_quarantine_set_id;
  if v_quarantine_loaded<>v_quarantine_expected then
    raise exception 'gate G10: quarantine set count % differs from declared %',v_quarantine_loaded,v_quarantine_expected
      using errcode='P1G20'; end if;
  select count(*) into v_bad
  from rosetta_replay.quarantine_control_run q
  where q.quarantine_set_id=p_quarantine_set_id and not exists(
    select 1 from rosetta_replay.sealed_corpus_member m
    where m.manifest_id=p_manifest_id and m.control_run_id=q.control_run_id
      and m.quarantine_required);
  if v_bad>0 then raise exception 'gate G10: % quarantined control runs are absent from flagged corpus membership',v_bad
    using errcode='P1G20'; end if;

  -- G11 one explicit human authorization bound to the whole identity.
  select count(*) into v_auth from rosetta_replay.human_authorization h
  where h.scope='promotion' and h.manifest_id=p_manifest_id
    and h.engine_version=p_engine_version and h.rule_set_version=p_rule_set_version
    and h.configuration_contract_hash=p_configuration_contract_hash
    and h.closure_hash=p_closure_hash and h.quarantine_set_id=p_quarantine_set_id;
  if v_auth<>1 then raise exception 'gate G11: require exactly one fully bound promotion authorization, found %',v_auth
    using errcode='P1G21'; end if;

  return jsonb_build_object('gate','passed','manifest_id',p_manifest_id,
    'closure_prefix',p_closure_prefix,'engine_version',p_engine_version,
    'rule_set_version',p_rule_set_version,
    'configuration_contract_hash',p_configuration_contract_hash,
    'closure_hash',p_closure_hash,'quarantine_set_id',p_quarantine_set_id,
    'candidate_ambiguity',v_candidate_ambiguity,'control_ambiguity',v_control_ambiguity,
    'checked_at',clock_timestamp());
end;
$fn$;
