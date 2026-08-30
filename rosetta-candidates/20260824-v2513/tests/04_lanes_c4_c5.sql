-- tests/04_lanes_c4_c5.sql — C4 occurrence-aware spans, C5 decomposition
\set QUIET on

-- C4: occurrence counts drive resolution
do $$
declare c1 integer; c2 integer; loc record;
begin
  -- two occurrences of the same clause text in one block
  select rosetta_v2513.c4_rosetta_v2512_normalized_occurrence_count(
    'The clerk shall file. The clerk shall file.', 'The clerk shall file.') into c2;
  if c2 <> 2 then raise exception 'TEST_FAIL c4 count=% expected 2', c2; end if;
  select rosetta_v2513.c4_rosetta_v2512_normalized_occurrence_count(
    'The clerk shall file. The mayor may act.', 'The clerk shall file.') into c1;
  if c1 <> 1 then raise exception 'TEST_FAIL c4 count=% expected 1', c1; end if;
  -- second occurrence located at the second position
  select * into loc from rosetta_v2513.c4_rosetta_v2512_locate_normalized_text_occurrence(
    'The clerk shall file. The clerk shall file.', 'The clerk shall file.', 2);
  if loc.span_status <> 'resolved' or loc.source_offset_start = 0 then
    raise exception 'TEST_FAIL c4 occurrence 2 resolution: % %', loc.span_status, loc.source_offset_start;
  end if;
  raise notice 'PASS 04.1 C4 occurrence counting and ordinal binding';
end $$;

-- C5: decomposition — conditional prefixes and scaffolds are never actors
do $$
declare d record; v_clause text;
begin
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(
    'If the council fails to act within 30 days, the mayor shall convene a special session.');
  if lower(d.actor) is distinct from 'the mayor' then
    raise exception 'TEST_FAIL c5 conditional prefix actor=%', d.actor; end if;
  if d.leading_condition is null or d.leading_condition not ilike 'if the council%' then
    raise exception 'TEST_FAIL c5 leading condition=%', d.leading_condition; end if;

  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(
    'Section 5 is amended to read as follows: the clerk shall publish notice.');
  if lower(d.actor) is distinct from 'the clerk' then
    raise exception 'TEST_FAIL c5 scaffold actor=%', d.actor; end if;
  if d.scaffold is null or d.scaffold not ilike '%to read as follows%' then
    raise exception 'TEST_FAIL c5 scaffold=%', d.scaffold; end if;

  -- WA-style scaffold seen in HB1345: the RCW lead-in and subdivision marker
  -- are context, not the actor; the relative qualifier is preserved separately.
  v_clause := '70A RCW to read as follows: (1) Counties that are required or choose to plan under this chapter shall adopt regulations.';
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(v_clause);
  if lower(d.actor) is distinct from 'counties' then
    raise exception 'TEST_FAIL c5 WA scaffold/qualifier actor=%', d.actor; end if;
  if d.scaffold is null or d.leading_condition not ilike '%actor qualification:%' then
    raise exception 'TEST_FAIL c5 WA scaffold/qualifier context=% / %', d.scaffold, d.leading_condition; end if;
  if substr(v_clause,d.actor_offset_start+1,d.actor_offset_end-d.actor_offset_start) is distinct from d.actor then
    raise exception 'TEST_FAIL c5 WA actor offsets do not round-trip: % [%:%]', d.actor, d.actor_offset_start, d.actor_offset_end; end if;

  -- modal / action / trailing condition
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(
    'The treasurer shall remit funds if the board approves.');
  if d.modal <> 'shall' or d.action not ilike 'remit funds%' or d.trailing_condition is null then
    raise exception 'TEST_FAIL c5 modal/action/trailing: % % %', d.modal, d.action, d.trailing_condition;
  end if;

  -- offsets delimit the actor exactly
  v_clause := '(a)  The treasurer shall remit funds.';
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(v_clause);
  if d.actor_offset_start is null or d.actor_offset_end is null
     or d.actor_offset_end <= d.actor_offset_start then
    raise exception 'TEST_FAIL c5 offsets % %', d.actor_offset_start, d.actor_offset_end;
  end if;
  if substr(v_clause,d.actor_offset_start+1,d.actor_offset_end-d.actor_offset_start) is distinct from d.actor then
    raise exception 'TEST_FAIL c5 actor offsets do not round-trip exactly: actor=% raw=%',
      d.actor,substr(v_clause,d.actor_offset_start+1,d.actor_offset_end-d.actor_offset_start);
  end if;

  -- passive voice: no actor before modal -> actor null, never invented
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause(
    'The report shall be filed annually.');
  if lower(d.actor) is distinct from 'the report' then
    raise exception 'TEST_FAIL c5 passive clause actor=%', d.actor; end if;

  -- opposing/negative-polarity subjects stay structurally distinct: the
  -- grammar binds 'No person' as actor and 'shall' as modal; polarity
  -- semantics are C6's domain, but the decomposition must be exact
  select * into d from rosetta_v2513.c5_rosetta_v25_decompose_clause('No person shall enter.');
  if lower(d.actor) is distinct from 'no person' then
    raise exception 'TEST_FAIL c5 negative-subject actor=%', d.actor; end if;
  if d.modal is distinct from 'shall' then
    raise exception 'TEST_FAIL c5 negative-subject modal=%', d.modal; end if;
  raise notice 'PASS 04.2 C5 decomposition';
end $$;

-- C1 and C5 must be genuinely independent variables on a clause that
-- exercises C5's conditional-prefix decomposition. A generic happy-path
-- fixture can legitimately yield the same objects from both lanes, so this
-- differential trigger is mandatory.
do $$
declare c1_actor text; c5_actor text;
begin
  select actor into c1_actor
    from rosetta_v2513.c1_rosetta_v25_modal_and_actor(
      'If the council fails to act within 30 days, the mayor shall convene a special session.');
  select actor into c5_actor
    from rosetta_v2513.c5_rosetta_v25_modal_and_actor(
      'If the council fails to act within 30 days, the mayor shall convene a special session.');
  if lower(c5_actor) is distinct from 'the mayor' then
    raise exception 'TEST_FAIL C5 differential actor=%', c5_actor;
  end if;
  if c1_actor is not distinct from c5_actor then
    raise exception 'TEST_FAIL C1 and C5 are not independent on the C5 trigger: actor=%', c5_actor;
  end if;
  raise notice 'PASS 04.3 C1/C5 differential trigger produces distinct actor semantics';
end $$;

-- C5 sentence segmentation: a person-name middle initial remains inside the
-- normative clause. The rule is intentionally narrower than a generic
-- capital-dot-capital substitution so sentence labels remain boundaries.
do $$
declare
  v_text text := 'David R. Poynter shall submit the report.';
  v_control_actor text;
  v_candidate_actor text;
  v_candidate_clause text;
  v_label_actor text;
  v_rule_actor text;
  v_qualified_actor text;
  v_qualified_clause text;
begin
  select actor into v_control_actor
    from rosetta_v2513.ctl_rosetta_v25_normative_clauses(v_text)
    order by clause_ordinal limit 1;
  select actor, clause_text into v_candidate_actor, v_candidate_clause
    from rosetta_v2513.c5_rosetta_v25_normative_clauses(v_text)
    order by clause_ordinal limit 1;
  if v_control_actor is distinct from 'Poynter' then
    raise exception 'TEST_FAIL control middle-initial behavior drifted: actor=%',
      v_control_actor;
  end if;
  if v_candidate_actor is distinct from 'David R. Poynter'
     or v_candidate_clause is distinct from v_text then
    raise exception 'TEST_FAIL c5 middle initial actor/clause=% / %',
      v_candidate_actor, v_candidate_clause;
  end if;

  select actor into v_label_actor
    from rosetta_v2513.c5_rosetta_v25_normative_clauses(
      'Plan A. The agency shall file the report.')
    order by clause_ordinal limit 1;
  if v_label_actor is distinct from 'The agency' then
    raise exception 'TEST_FAIL c5 sentence label over-protected: actor=%',
      v_label_actor;
  end if;
  select actor into v_rule_actor
    from rosetta_v2513.c5_rosetta_v25_normative_clauses(
      'Rule A. Smith shall file the report.')
    order by clause_ordinal limit 1;
  if v_rule_actor is distinct from 'Smith' then
    raise exception 'TEST_FAIL c5 Rule label over-protected: actor=%',
      v_rule_actor;
  end if;
  select actor, clause_text into v_qualified_actor, v_qualified_clause
    from rosetta_v2513.c5_rosetta_v25_normative_clauses(
      'David R. Poynter, director, shall file the report.')
    order by clause_ordinal limit 1;
  if v_qualified_actor is distinct from 'David R. Poynter, director'
     or v_qualified_clause is distinct from
       'David R. Poynter, director, shall file the report.' then
    raise exception 'TEST_FAIL c5 qualified middle initial actor/clause=% / %',
      v_qualified_actor, v_qualified_clause;
  end if;
  raise notice 'PASS 04.4 C5 person middle initial protected without label collision';
end $$;
