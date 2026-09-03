-- tests/11_open_regressions.sql
-- Exact historical regressions prove universal behavior. They are fixtures,
-- never parser selectors: transformed sources require verified acquisition
-- receipts, ambiguous dates require provenance, and generic grammar changes
-- must preserve negative controls.
\set QUIET on

do $$
declare
  v_page text := 'PAGE 4-HOUSE BILL 26-1432';
  v_page_glued text := 'PAGE 4-HOUSE BILL 25-1117COMPANY shall file.';
  v_name text := 'David R. Poynter shall submit the report.';
  v_digest text := 'The following digest constitutes no part of the legislative instrument. '
                || 'It was prepared by an identified drafter.'
                || chr(10) || 'DIGEST' || chr(10)
                || 'Proposed law provides that the board shall adopt rules.';
  v_clean text := 'The clerk shall file the verified report.';
  v_actor text;
  v_rule_actor text;
  v_clause text;
  v_corpus integer;
  v_doc integer;
  v_clean_hash text;
  v_raw_hash text := repeat('a',64);
  v_rejected boolean;
  v_date_receipt jsonb;
begin
  insert into rosetta_v2513.corpus (corpus_name)
    values ('test-corpus-11-global-contract')
    returning id into v_corpus;
  insert into rosetta_v2513.source_document
    (corpus_id, document_name, document_type)
    values (v_corpus, 'doc-11-global-contract', 'statute')
    returning id into v_doc;

  -- The two exact extracted-PDF failures may not be made to pass by embedding
  -- their layout strings in Rosetta. Without a registered raw-to-text receipt,
  -- both are explicit acquisition rejections.
  v_rejected := false;
  begin
    perform rosetta_v2513.v2513_rosetta_v25_source_acquisition_gate(
      v_doc, v_page || chr(10) || v_page_glued, 'application/pdf',
      'unverified-page-source', 'test://unverified-page-source',
      repeat('b',64), 'unverified-extractor');
  exception when sqlstate 'P1A03' then
    if sqlerrm not like 'content_extraction_receipt_missing:%' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAIL exact page-furniture source passed without receipt';
  end if;

  v_rejected := false;
  begin
    perform rosetta_v2513.v2513_rosetta_v25_source_acquisition_gate(
      v_doc, v_digest, 'application/pdf',
      'unverified-digest-source', 'test://unverified-digest-source',
      repeat('c',64), 'unverified-extractor');
  exception when sqlstate 'P1A03' then
    if sqlerrm not like 'content_extraction_receipt_missing:%' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAIL exact non-operative source passed without receipt';
  end if;

  -- The same acquisition gate accepts any source family when a generic,
  -- exact receipt binds raw bytes, extracted text, extractor, and residue
  -- verification. No jurisdiction or document identity appears in the rule.
  v_clean_hash := encode(extensions.digest(convert_to(v_clean,'UTF8'),'sha256'),'hex');
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_byte_hash,source_identity_hash,source_metadata)
  values(
    v_doc,'verified-projection','test://verified-projection','application/pdf',
    v_clean,v_clean_hash,v_raw_hash,
    encode(extensions.digest(convert_to('fixture:test-11:verified-projection','UTF8'),'sha256'),'hex'),
    jsonb_build_object('content_extraction_receipt',jsonb_build_object(
      'contract','rosetta-content-extraction-v1',
      'media_type','application/pdf',
      'extractor_version','test-projection-v1',
      'raw_source_sha256',v_raw_hash,
      'extracted_text_sha256',v_clean_hash,
      'projection_verified',true,
      'residue_check_passed',true)));
  perform rosetta_v2513.v2513_rosetta_v25_source_acquisition_gate(
    v_doc,v_clean,'application/pdf','verified-projection',
    'test://verified-projection',v_raw_hash,'test-projection-v1');

  -- A person-shaped initial is a universal sentence-boundary rule. Structural
  -- labels remain sentence boundaries, proving the rule does not blanket-merge.
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

  -- No date is valid or invalid merely because it falls on one side of an
  -- arbitrary epoch. A non-null as-of date is rejected without an exact
  -- receipt and accepted, regardless of era, when the receipt binds it.
  v_rejected := false;
  begin
    perform rosetta_v2513.v2513_rosetta_v25_reference_date_gate(
      date '1969-12-31', '{}'::jsonb);
  exception when sqlstate 'P1A03' then
    if sqlerrm <> 'reference_date_receipt_required: non-null reference_date is unverified' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST_FAIL unverified reference date passed';
  end if;

  foreach v_clause in array array['1890-01-01','1969-12-31','2030-01-01']
  loop
    v_date_receipt := jsonb_build_object(
      'reference_date_receipt',jsonb_build_object(
        'contract','rosetta-reference-date-receipt-v1',
        'reference_date',v_clause,
        'basis','evaluation_as_of',
        'verified',true,
        'evidence_sha256',repeat('e',64)));
    perform rosetta_v2513.v2513_rosetta_v25_reference_date_gate(
      v_clause::date,v_date_receipt);
  end loop;

  raise notice 'PASS 11 exact regressions obey universal fail-closed contracts';
end $$;
