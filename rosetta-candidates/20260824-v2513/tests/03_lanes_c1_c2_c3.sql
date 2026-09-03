-- tests/03_lanes_c1_c2_c3.sql
-- C1 overflow, C2 corruption detection, C3 universal acquisition/provenance.
\set QUIET on

-- C2: each corruption category detected; 'Whereas' alone is never corruption.
do $$
begin
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'Skip to main content menu navigation') then
    raise exception 'TEST_FAIL c2 chrome'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'Filed January 3, 2026 and amended March 4, 2026 by') then
    raise exception 'TEST_FAIL c2 date chain'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'The council &amp; the board') then
    raise exception 'TEST_FAIL c2 html entity'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'The coun' || chr(65533) || 'cil') then
    raise exception 'TEST_FAIL c2 replacement char'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'Section 4 is amended to read as follows') then
    raise exception 'TEST_FAIL c2 amendatory scaffold'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'The council shall act and the mayor may veto') then
    raise exception 'TEST_FAIL c2 multi-clause'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt('Go to top') then
    raise exception 'TEST_FAIL c2 go-to-top chrome'; end if;
  if not rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'referred to codes 03/04/2025, reported 03/11/2025') then
    raise exception 'TEST_FAIL c2 numeric action-history date chain'; end if;
  if rosetta_v2513.c2_rosetta_v25_actor_source_corrupt(
      'Whereas the city finds that public safety requires action') then
    raise exception 'TEST_FAIL c2 rejected Whereas merely for appearing';
  end if;
  if rosetta_v2513.ctl_rosetta_v25_actor_source_corrupt(
      'The council &amp; the board') then
    raise exception 'TEST_FAIL control unexpectedly detects entities';
  end if;
  raise notice 'PASS 03.1 C2 corruption categories + Whereas non-rule';
end $$;

-- C3: projection receipts are recomputable and declare the identity offset map.
do $$
declare
  r jsonb;
  raw text;
begin
  raw := 'Sec. 3. The clerk shall file.' || chr(10)
      || 'REVISOR NOTE' || chr(10) || '4.5 The board may act.';
  r := rosetta_v2513.c3_rosetta_v25_projection_receipt(raw);
  if r->>'raw_sha256' <>
       encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex') then
    raise exception 'TEST_FAIL c3 raw hash'; end if;
  if r->>'projection_version' <> 'rosetta-layout-projection-v2513c3' then
    raise exception 'TEST_FAIL c3 version tag'; end if;
  if r->>'offset_mapping_status' <> 'preserved'
     or r#>>'{offset_mapping,kind}' <> 'identity-character-offsets'
     or (r#>>'{offset_mapping,source_length}')::integer <> char_length(raw)
     or (r#>>'{offset_mapping,projected_length}')::integer <> char_length(raw) then
    raise exception 'TEST_FAIL c3 identity offset mapping'; end if;
  if not rosetta_v2513.c3_rosetta_v25_verify_projection(
      raw, rosetta_v2513.c3_rosetta_v25_layout_projection(raw)) then
    raise exception 'TEST_FAIL c3 recompute verification'; end if;
  if rosetta_v2513.c3_rosetta_v25_verify_projection(
      raw, 'tampered projection') then
    raise exception 'TEST_FAIL c3 tamper accepted'; end if;
  raise notice 'PASS 03.2 C3 projection contract verify/tamper';
end $$;

-- C3 refresh writes the same exact projection mapping onto stored receipts.
do $$
declare
  v_run integer;
  v_doc integer;
  v_res jsonb;
  v_receipts integer;
  v_spans integer;
begin
  insert into rosetta_v2513.corpus (corpus_name) values ('test-corpus-03');
  insert into rosetta_v2513.source_document
    (corpus_id, document_name, document_type)
    select id, 'doc-03', 'statute'
      from rosetta_v2513.corpus where corpus_name='test-corpus-03'
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
  insert into rosetta_v2513.workflow_step
    (id, workflow_pipeline_id, step_order, step_name, actor)
    values ('ws-03','wp-03',1,'The clerk shall file the report.','The clerk');
  v_res := rosetta_v2513.c3_rosetta_v25_refresh_object_source_spans(
    v_run, 'Sec. 3. The clerk shall file the report.');
  select count(*) into v_receipts
    from rosetta_v2513.projection_receipt
    where extraction_run_id = v_run
      and offset_mapping_status = 'preserved'
      and offset_mapping->>'kind' = 'identity-character-offsets';
  if v_receipts < 1 then
    raise exception 'TEST_FAIL c3 refresh wrote no mapped projection receipts';
  end if;
  select count(*) into v_spans
    from rosetta_v2513.rosetta_object_source_span
    where extraction_run_id = v_run
      and projection_version='rosetta-layout-projection-v2513c3';
  if v_spans < 1 then
    raise exception 'TEST_FAIL c3 refresh wrote no v2513c3 spans'; end if;
  if not exists (
      select 1 from rosetta_v2513.projection_receipt
      where extraction_run_id=v_run and verified) then
    raise exception 'TEST_FAIL c3 receipt not verified by recomputation'; end if;
  raise notice 'PASS 03.3 C3 refresh: % receipts, % spans, result %',
    v_receipts, v_spans, v_res;
end $$;

-- Identity text is accepted directly. HTML keeps its legacy exact receipt,
-- while the generic contract covers every other transformed media type.
do $$
declare
  v_doc integer;
  v_text text := 'Sec. 8. The clerk shall file the verified annual report.';
  v_hash text;
  v_raw_hash text := repeat('a',64);
  v_pdf_text text := 'Sec. 9. The board shall publish the verified record.';
  v_pdf_hash text;
begin
  select id into v_doc
    from rosetta_v2513.source_document where document_name='doc-03';

  perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
    v_doc,v_text,'text/plain','identity-v1','test://identity',
    null,'plain-text-1');

  v_hash := encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_byte_hash,source_identity_hash,source_metadata)
  values(
    v_doc,'html-v1','test://html-extracted','text/html',v_text,v_hash,v_raw_hash,
    encode(extensions.digest(convert_to('fixture:test-03:html-v1','UTF8'),'sha256'),'hex'),
    jsonb_build_object('content_extraction_receipt',jsonb_build_object(
      'contract','rosetta-html-content-extraction-v1',
      'extractor_version','test-html-v1',
      'raw_source_sha256',v_raw_hash,
      'extracted_text_sha256',v_hash,
      'navigation_removed',true,
      'action_tables_removed',true,
      'vote_chrome_removed',true)));
  perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
    v_doc,v_text,'text/html','html-v1','test://html-extracted',
    v_raw_hash,'test-html-v1');

  v_pdf_hash := encode(
    extensions.digest(convert_to(v_pdf_text,'UTF8'),'sha256'),'hex');
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_byte_hash,source_identity_hash,source_metadata)
  values(
    v_doc,'pdf-v1','test://pdf-extracted','application/pdf',v_pdf_text,
    v_pdf_hash,repeat('c',64),
    encode(extensions.digest(convert_to('fixture:test-03:pdf-v1','UTF8'),'sha256'),'hex'),
    jsonb_build_object('content_extraction_receipt',jsonb_build_object(
      'contract','rosetta-content-extraction-v1',
      'media_type','application/pdf',
      'extractor_version','test-pdf-v1',
      'raw_source_sha256',repeat('c',64),
      'extracted_text_sha256',v_pdf_hash,
      'projection_verified',true,
      'residue_check_passed',true)));
  perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
    v_doc,v_pdf_text,'application/pdf','pdf-v1','test://pdf-extracted',
    repeat('c',64),'test-pdf-v1');

  begin
    perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
      v_doc,'Go to top <nav>menu</nav>','text/html','html-v1',
      'test://html-extracted',v_raw_hash,'test-html-v1');
    raise exception 'TEST_FAIL c3 raw/chrome HTML reached parser boundary';
  exception when sqlstate 'P1A03' then null;
  end;
  begin
    perform rosetta_v2513.c3_rosetta_v25_source_acquisition_gate(
      v_doc,'unregistered PDF projection','application/pdf','pdf-v2',
      'test://pdf-unregistered',repeat('e',64),'test-pdf-v1');
    raise exception 'TEST_FAIL c3 unreceipted PDF reached parser boundary';
  exception when sqlstate 'P1A03' then null;
  end;
  raise notice 'PASS 03.4 C3 universal acquisition receipts';
end $$;

-- Reference dates are evidence-bound, not accepted/rejected by epoch.
do $$
declare
  v_metadata jsonb;
  v_date_text text;
  v_rejected boolean := false;
begin
  perform rosetta_v2513.c3_rosetta_v25_reference_date_gate(
    null,'{}'::jsonb);
  begin
    perform rosetta_v2513.c3_rosetta_v25_reference_date_gate(
      date '2026-01-01','{}'::jsonb);
  exception when sqlstate 'P1A03' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAIL c3 accepted unverified reference date';
  end if;

  foreach v_date_text in array array['1890-01-01','2030-01-01']
  loop
    v_metadata := jsonb_build_object(
      'reference_date_receipt',jsonb_build_object(
        'contract','rosetta-reference-date-receipt-v1',
        'reference_date',v_date_text,
        'basis','evaluation_as_of',
        'verified',true,
        'evidence_sha256',repeat('f',64)));
    perform rosetta_v2513.c3_rosetta_v25_reference_date_gate(
      v_date_text::date,v_metadata);
  end loop;
  raise notice 'PASS 03.5 C3 reference dates require value-bound provenance';
end $$;
