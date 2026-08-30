-- tests/03_lanes_c1_c2_c3.sql — C1 overflow, C2 corruption detection, C3 projection contract
\set QUIET on

-- C2: each corruption category detected; 'Whereas' alone is never corruption
do $$
begin
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Skip to main content menu navigation') then
    raise exception 'TEST_FAIL c2 chrome'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Filed January 3, 2026 and amended March 4, 2026 by') then
    raise exception 'TEST_FAIL c2 date chain'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('The council &amp; the board') then
    raise exception 'TEST_FAIL c2 html entity'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('The coun' || chr(65533) || 'cil') then
    raise exception 'TEST_FAIL c2 replacement char'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Section 4 is amended to read as follows') then
    raise exception 'TEST_FAIL c2 amendatory scaffold'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('The council shall act and the mayor may veto') then
    raise exception 'TEST_FAIL c2 multi-clause'; end if;
  -- observed NY artifacts: 'Go to top' chrome and numeric action-history chains
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Go to top') then
    raise exception 'TEST_FAIL c2 go-to-top chrome'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('referred to codes 03/04/2025, reported 03/11/2025') then
    raise exception 'TEST_FAIL c2 numeric action-history date chain'; end if;
  -- explicit non-rule: Whereas alone is not corruption
  if rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Whereas the city finds that public safety requires action') then
    raise exception 'TEST_FAIL c2 rejected Whereas merely for appearing';
  end if;
  -- control behavior unchanged: narrower detector
  if rosetta_v2513.ctl_rosetta_v25_actor_source_corrupt('The council &amp; the board') then
    raise exception 'TEST_FAIL control unexpectedly detects entities';
  end if;
  raise notice 'PASS 03.1 C2 corruption categories + Whereas non-rule';
end $$;

-- C3: hash-bound projection receipts verify by recomputation; tamper fails
do $$
declare r jsonb; raw text;
begin
  raw := 'Sec. 3. The clerk shall file.' || chr(10) || 'REVISOR NOTE' || chr(10) || '4.5 The board may act.';
  r := rosetta_v2513.c3_rosetta_v25_projection_receipt(raw);
  if r->>'raw_sha256' <> encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex') then
    raise exception 'TEST_FAIL c3 raw hash'; end if;
  if r->>'projection_version' <> 'rosetta-layout-projection-v2513c3' then
    raise exception 'TEST_FAIL c3 version tag'; end if;
  if r->>'offset_mapping_status' <> 'not_preserved_declared' then
    raise exception 'TEST_FAIL c3 offset declaration'; end if;
  if not rosetta_v2513.c3_rosetta_v25_verify_projection(raw, rosetta_v2513.c3_rosetta_v25_layout_projection(raw)) then
    raise exception 'TEST_FAIL c3 recompute verification'; end if;
  if rosetta_v2513.c3_rosetta_v25_verify_projection(raw, 'tampered projection') then
    raise exception 'TEST_FAIL c3 tamper accepted'; end if;
  raise notice 'PASS 03.2 C3 projection contract verify/tamper';
end $$;

-- 03.3 C3 refresh invoked at runtime: receipts written, spans carry the c3
-- projection version, and the fail-closed check runs inside the refresh.
do $$
declare v_run integer; v_doc integer; v_res jsonb; v_receipts integer; v_spans integer;
begin
  insert into rosetta_v2513.corpus (corpus_name) values ('test-corpus-03');
  insert into rosetta_v2513.source_document (corpus_id, document_name, document_type)
    select id, 'doc-03', 'statute' from rosetta_v2513.corpus
     where corpus_name='test-corpus-03'
    returning id into v_doc;
  insert into rosetta_v2513.extraction_run (source_document_id, run_version)
    values (v_doc, 301) returning id into v_run;
  insert into rosetta_v2513.hr1_raw_blocks
    (id, source_document_id, extraction_run_id, block_type, section_number,
     section_heading_hash, block_content_hash, hierarchy_path,
     char_offset_start, char_offset_end)
    select 'b03', v_doc, v_run, 'section', '3', repeat('0',64), repeat('1',64),
           '3', 0, char_length('Sec. 3. The clerk shall file the report.');
  insert into rosetta_v2513.workflow_pipeline
    (id, corpus_id, source_document_id, extraction_run_id, pipeline_name,
     governing_section, pipeline_type, source_block_id)
    select 'wp-03', id, v_doc, v_run, 'p', '3', 'compliance', 'b03'
    from rosetta_v2513.corpus where corpus_name='test-corpus-03';
  insert into rosetta_v2513.workflow_step (id, workflow_pipeline_id, step_order, step_name, actor)
    values ('ws-03','wp-03',1,'The clerk shall file the report.','The clerk');
  v_res := rosetta_v2513.c3_rosetta_v25_refresh_object_source_spans(
             v_run, 'Sec. 3. The clerk shall file the report.');
  select count(*) into v_receipts from rosetta_v2513.projection_receipt
   where extraction_run_id = v_run;
  if v_receipts < 1 then
    raise exception 'TEST_FAIL c3 refresh wrote no projection receipts'; end if;
  select count(*) into v_spans from rosetta_v2513.rosetta_object_source_span
   where extraction_run_id = v_run and projection_version='rosetta-layout-projection-v2513c3';
  if v_spans < 1 then
    raise exception 'TEST_FAIL c3 refresh wrote no v2513c3 spans'; end if;
  if not exists (select 1 from rosetta_v2513.projection_receipt
                 where extraction_run_id=v_run and verified) then
    raise exception 'TEST_FAIL c3 receipt not verified by recomputation'; end if;
  raise notice 'PASS 03.3 C3 refresh invoked: % receipts, % spans, result %',
    v_receipts, v_spans, v_res;
end $$;

-- C3 acquisition boundary: raw HTML cannot reach the parser.  Only exact
-- registered extracted text with a raw-byte/extracted-text receipt passes.
do $$
declare v_doc integer;v_text text:='Sec. 8. The clerk shall file the verified annual report with the council. ' || repeat('The report contains source-bound public records. ',4);
        v_hash text;v_raw_hash text:=repeat('a',64);
begin
  select id into v_doc from rosetta_v2513.source_document where document_name='doc-03';
  v_hash:=encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_byte_hash,source_identity_hash,source_metadata)
  values(v_doc,'html-v1','test://html-extracted','text/html',v_text,v_hash,v_raw_hash,
    repeat('b',64),jsonb_build_object('content_extraction_receipt',jsonb_build_object(
      'contract','rosetta-html-content-extraction-v1','extractor_version','test-1',
      'raw_source_sha256',v_raw_hash,'extracted_text_sha256',v_hash,
      'navigation_removed',true,'action_tables_removed',true,'vote_chrome_removed',true)));
  perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
    v_doc,v_text,'text/html','html-v1','test://html-extracted');
  begin
    perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
      v_doc,'Go to top Actions: BILL NO A1 <nav>menu</nav>','text/html',
      'html-v1','test://html-extracted');
    raise exception 'TEST_FAIL c3 raw/chrome HTML reached parser boundary';
  exception when sqlstate 'P1A03' then null;
  end;
  raise notice 'PASS 03.4 C3 exact HTML acquisition receipt required';
end $$;

-- C3 layout projection: Colorado PAGE furniture is masked in place while text
-- glued on either side remains visible. The 2.5.11 control is pinned to the
-- known pre-fix behavior.
do $$
declare
  v_header text := 'PAGE 4-HOUSE BILL 26-1432';
  v_raw text;
  v_candidate text;
  v_control text;
begin
  v_raw := 'Opening line' || chr(10) || v_header || chr(10)
        || 'The clerk shall file the report. An exhibit cites '
        || v_header || ' in narrative text.';
  v_candidate := rosetta_v2513.c3_rosetta_v25_layout_projection(v_raw);
  v_control := rosetta_v2513.ctl_rosetta_v25_layout_projection(v_raw);
  if char_length(v_candidate) <> char_length(v_raw) then
    raise exception 'TEST_FAIL c3 page projection changed source length';
  end if;
  if strpos(v_control, v_header) = 0 then
    raise exception 'TEST_FAIL control no longer exposes page-line regression';
  end if;
  if strpos(split_part(v_candidate, chr(10), 2), v_header) > 0 then
    raise exception 'TEST_FAIL c3 Colorado page line leaked';
  end if;
  if strpos(v_candidate, v_header) > 0
     or strpos(v_candidate, 'An exhibit cites ') = 0
     or strpos(v_candidate, ' in narrative text.') = 0
     or strpos(v_candidate, 'The clerk shall file the report.') = 0 then
    raise exception 'TEST_FAIL c3 page rule failed token-only masking';
  end if;
  if strpos(
       rosetta_v2513.c3_rosetta_v25_layout_projection(
         'PAGE 12-SENATE BILL 24-088' || chr(10) || 'The board shall act.'),
       'PAGE 12-SENATE BILL 24-088') > 0 then
    raise exception 'TEST_FAIL c3 Senate page line leaked';
  end if;
  if rosetta_v2513.c3_rosetta_v25_layout_projection(
       'PAGE 4-HOUSE BILL 25-1117COMPANY shall file.')
       not like '%COMPANY shall file.%' then
    raise exception 'TEST_FAIL c3 page rule erased glued operative letters';
  end if;
  if rosetta_v2513.c3_rosetta_v25_layout_projection(
       'Opening text.PAGE 4-HOUSE BILL 25-1117COMPANY shall file.')
       not like 'Opening text.%COMPANY shall file.%' then
    raise exception 'TEST_FAIL c3 page rule erased preceding glued text';
  end if;
  if rosetta_v2513.c3_rosetta_v25_layout_projection(
       'PAGE 4-HOUSE BILL 19-13148-83-503. Office created.')
       not like '%8-83-503. Office created.%' then
    raise exception 'TEST_FAIL c3 page rule erased glued operative digits';
  end if;
  if rosetta_v2513.c3_rosetta_v25_layout_projection(
       'PAGE 7-SENATE BILL 25-0038-83-503. Office created.')
       not like '%8-83-503. Office created.%' then
    raise exception 'TEST_FAIL c3 Senate page rule erased glued operative digits';
  end if;
  if strpos(
       rosetta_v2513.c3_rosetta_v25_layout_projection(
         'PAGE 2-HOUSE BILL 23B-1001' || chr(10) || 'The board shall act.'),
       'PAGE 2-HOUSE BILL 23B-1001') > 0 then
    raise exception 'TEST_FAIL c3 Colorado special-session page line leaked';
  end if;
  raise notice 'PASS 03.5 C3 Colorado House/Senate page furniture masked in place';
end $$;

-- C3 non-operative region: a Louisiana Legislative Services disclaimer binds
-- a nearby DIGEST as non-operative. Operative text remains extractable.
do $$
declare
  v_digest text;
  v_mixed text;
  v_operational_digest text;
  v_enact_after_digest text;
  v_remote_digest text;
  v_control_count integer;
  v_candidate_count integer;
  v_mixed_count integer;
  v_operational_count integer;
  v_enact_count integer;
begin
  v_digest := 'The following digest was prepared by Senate Legislative Services and '
           || 'constitutes no part of the legislative instrument.'
           || chr(10) || 'DIGEST' || chr(10)
           || 'HB 1 Engrossed 2026 Regular Session' || chr(10)
           || 'Proposed law provides that the board shall adopt rules.';
  select count(*) into v_control_count
    from rosetta_v2513.ctl_rosetta_v25_normative_clauses(v_digest);
  select count(*) into v_candidate_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(v_digest);
  if v_control_count = 0 then
    raise exception 'TEST_FAIL control no longer exposes DIGEST regression';
  end if;
  if v_candidate_count <> 0 then
    raise exception 'TEST_FAIL c3 DIGEST emitted % normative clauses', v_candidate_count;
  end if;

  -- The official House layout reverses the order: DIGEST, then disclaimer.
  select count(*) into v_candidate_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(
      'DIGEST' || chr(10)
      || 'The digest printed below was prepared by House Legislative Services. '
      || 'It constitutes no part of the legislative instrument.' || chr(10)
      || 'Proposed law provides that the board shall adopt rules.');
  if v_candidate_count <> 0 then
    raise exception 'TEST_FAIL c3 House-order DIGEST emitted % clauses',
      v_candidate_count;
  end if;

  v_mixed := 'Sec. 1. The clerk shall file the report.' || chr(10)
          || 'The following digest was prepared by Senate Legislative Services and '
          || 'constitutes no part of the legislative instrument.' || chr(10)
          || 'DIGEST' || chr(10)
          || 'Proposed law provides that the board shall adopt rules.';
  select count(*) into v_mixed_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(v_mixed);
  if v_mixed_count <> 1 then
    raise exception 'TEST_FAIL c3 operative text before DIGEST count=%', v_mixed_count;
  end if;

  -- A heading alone is not sufficient evidence that a section is
  -- non-operative in a general-purpose law decomposer.
  v_operational_digest := 'DIGEST' || chr(10)
                       || 'The board shall adopt the digest protocol.';
  select count(*) into v_operational_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(v_operational_digest);
  if v_operational_count <> 1 then
    raise exception 'TEST_FAIL c3 erased DIGEST without non-operative disclaimer';
  end if;

  -- Alternate Senate disclaimer wording is source-authenticated too.
  select count(*) into v_candidate_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(
      'The digest prepared by Senate Legislative Services does not constitute a part '
      || 'of the legislative instrument.' || chr(10)
      || 'DIGEST' || chr(10)
      || 'Proposed law provides that the board shall adopt rules.');
  if v_candidate_count <> 0 then
    raise exception 'TEST_FAIL c3 alternate Senate DIGEST emitted % clauses',
      v_candidate_count;
  end if;

  -- Official Louisiana digests may name an individual drafter rather than
  -- House/Senate Legislative Services; the disclaimer is authoritative.
  select count(*) into v_candidate_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(
      'The following digest constitutes no part of the legislative instrument. '
      || 'It was prepared by Archana D. Cadge.' || chr(10)
      || 'DIGEST' || chr(10)
      || 'Proposed law provides that the board shall adopt rules.');
  if v_candidate_count <> 0 then
    raise exception 'TEST_FAIL c3 named-drafter DIGEST emitted % clauses',
      v_candidate_count;
  end if;

  -- If a recognized digest precedes operative text, preserve the full
  -- Louisiana enacting clause rather than trusting a bare AN ACT marker.
  v_enact_after_digest := 'DIGEST' || chr(10)
                       || 'Prepared by House Legislative Services. It constitutes no part '
                       || 'of the legislative instrument.' || chr(10)
                       || 'Proposed law provides that the board shall adopt rules.' || chr(10)
                       || 'Be it enacted by the Legislature of Louisiana:' || chr(10)
                       || 'The clerk shall file the report.';
  select count(*) into v_enact_count
    from rosetta_v2513.c3_rosetta_v25_normative_clauses(v_enact_after_digest);
  if v_enact_count <> 1 then
    raise exception 'TEST_FAIL c3 failed to preserve enacting clause after DIGEST count=%',
      v_enact_count;
  end if;

  v_remote_digest := 'DIGEST' || chr(10) || repeat('x', 1100) || chr(10)
                  || 'Prepared by House Legislative Services. It constitutes no part '
                  || 'of the legislative instrument.' || chr(10)
                  || 'The board shall adopt rules.';
  if strpos(
       rosetta_v2513.c3_rosetta_v25_layout_projection(v_remote_digest),
       'DIGEST') = 0 then
    raise exception 'TEST_FAIL c3 accepted remote DIGEST disclaimer';
  end if;
  raise notice 'PASS 03.6 C3 Louisiana DIGEST excluded without losing operative text';
end $$;

-- C3 provider/reference-date gate: a pre-epoch transport date is rejected
-- before any source lookup or candidate write. Null and the inclusive floor
-- remain valid.
do $$
declare v_rejected boolean := false;
begin
  perform rosetta_v2513.c3_rosetta_v25_reference_date_gate(null);
  perform rosetta_v2513.c3_rosetta_v25_reference_date_gate(date '1970-01-01');
  begin
    perform rosetta_v2513.c3_run_rosetta_v3_extraction_v2511_base(
      -1,
      'The board shall act.',
      repeat('0',64),
      'test://epoch-regression',
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
    raise exception 'TEST_FAIL c3 accepted 1969-12-31 reference date';
  end if;
  raise notice 'PASS 03.7 C3 pre-epoch reference date rejected before extraction';
end $$;
