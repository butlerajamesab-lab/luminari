-- tests/11_open_regressions.sql — exact Rosetta 2.5.13 open-regression controls
\set QUIET on

do $$
declare
  v_page text := 'PAGE 4-HOUSE BILL 26-1432';
  v_page_glued text := 'PAGE 4-HOUSE BILL 25-1117COMPANY shall file.';
  v_name text := 'David R. Poynter shall submit the report.';
  v_digest text := 'The following digest constitutes no part of the legislative instrument. '
                || 'It was prepared by Archana D. Cadge.'
                || chr(10) || 'DIGEST' || chr(10)
                || 'HB 1 Engrossed 2026 Regular Session' || chr(10)
                || 'Proposed law provides that the board shall adopt rules.';
  v_actor text;
  v_rule_actor text;
  v_clause text;
  v_count integer;
  v_rejected boolean := false;
begin
  -- Regression 1: page furniture is masked, not deleted, so offsets survive.
  if char_length(rosetta_v2513.v2513_rosetta_v25_layout_projection(v_page))
       <> char_length(v_page)
     or strpos(
       rosetta_v2513.v2513_rosetta_v25_layout_projection(v_page),
       v_page) > 0 then
    raise exception 'TEST_FAIL convergence Colorado PAGE line leak';
  end if;
  if rosetta_v2513.v2513_rosetta_v25_layout_projection(v_page_glued)
       not like '%COMPANY shall file.%'
     or strpos(
       rosetta_v2513.v2513_rosetta_v25_layout_projection(v_page_glued),
       'PAGE 4-HOUSE BILL 25-1117') > 0 then
    raise exception 'TEST_FAIL convergence Colorado glued PAGE token';
  end if;

  -- Regression 2: a person middle initial remains part of one clause/actor.
  select actor, clause_text into v_actor, v_clause
    from rosetta_v2513.v2513_rosetta_v25_normative_clauses(v_name)
    order by clause_ordinal limit 1;
  if v_actor is distinct from 'David R. Poynter'
     or v_clause is distinct from v_name then
    raise exception 'TEST_FAIL convergence middle initial=% / %', v_actor, v_clause;
  end if;
  select actor into v_rule_actor
    from rosetta_v2513.v2513_rosetta_v25_normative_clauses(
      'Rule A. Smith shall file the report.')
    order by clause_ordinal limit 1;
  if v_rule_actor is distinct from 'Smith' then
    raise exception 'TEST_FAIL convergence structural label=%', v_rule_actor;
  end if;

  -- Regression 3: Louisiana DIGEST content is non-operative.
  select count(*) into v_count
    from rosetta_v2513.v2513_rosetta_v25_normative_clauses(v_digest);
  if v_count <> 0 then
    raise exception 'TEST_FAIL convergence DIGEST count=%', v_count;
  end if;

  -- Regression 4: a pre-epoch provider/reference date fails before extraction.
  begin
    perform rosetta_v2513.v2513_run_rosetta_v3_extraction_v2511_base(
      -1,
      'The board shall act.',
      repeat('0',64),
      'test://epoch-regression-convergence',
      'v1',
      'text/plain',
      null,
      null,
      date '1969-12-31');
  exception when sqlstate 'P1A03' then
    if sqlerrm not like 'reference_date_below_provider_observation_floor:%' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAIL convergence accepted 1969-12-31 reference date';
  end if;

  raise notice 'PASS 11 Rosetta open regressions fixed in convergence candidate';
end $$;
