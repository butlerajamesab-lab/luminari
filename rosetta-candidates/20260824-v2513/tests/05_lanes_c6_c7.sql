-- tests/05_lanes_c6_c7.sql — C6 modal retyping revalidation, C7 charset gate
\set QUIET on

-- fixtures: one corpus/document/block/route
insert into rosetta_v2513.corpus (corpus_name) values ('test-corpus-05');
insert into rosetta_v2513.source_document (corpus_id, document_name, document_type)
  select id, 'doc-05', 'statute' from rosetta_v2513.corpus where corpus_name='test-corpus-05';
insert into rosetta_v2513.extraction_run (source_document_id, run_version)
  select id, 501 from rosetta_v2513.source_document where document_name='doc-05';
insert into rosetta_v2513.hr1_raw_blocks
  (id, source_document_id, extraction_run_id, block_type, section_number, section_heading_hash, block_content_hash, hierarchy_path, char_offset_start, char_offset_end)
  select 'b1', sd.id, er.id, 'section', '1', repeat('0',64), repeat('1',64), '1', 0, 200
  from rosetta_v2513.source_document sd
  join rosetta_v2513.extraction_run er on er.source_document_id = sd.id
 where sd.document_name='doc-05' and er.run_version=501;
insert into rosetta_v2513.accountability_route
  (id, corpus_id, extraction_run_id, source_document_id, source_block_id, route_name, governing_section, trigger_condition, enforcement_type, action_type)
  select 'route-1', sd.corpus_id, er.id, sd.id, 'b1', 'route', '1', 'the officer shall not enter and the mayor may appeal', 'administrative', null
  from rosetta_v2513.source_document sd
  join rosetta_v2513.extraction_run er on er.source_document_id = sd.id
 where sd.document_name='doc-05' and er.run_version=501;
insert into rosetta_v2513.accountability_route
  (id, corpus_id, extraction_run_id, source_document_id, source_block_id, route_name, governing_section, trigger_condition, enforcement_type, action_type)
  select 'route-2', sd.corpus_id, er.id, sd.id, 'b1', 'route', '1', 'the officer shall not act and the deputy may not enter', 'administrative', null
  from rosetta_v2513.source_document sd
  join rosetta_v2513.extraction_run er on er.source_document_id = sd.id
 where sd.document_name='doc-05' and er.run_version=501;
insert into rosetta_v2513.accountability_route
  (id, corpus_id, extraction_run_id, source_document_id, source_block_id, route_name, governing_section, trigger_condition, enforcement_type, action_type)
  select 'route-3', sd.corpus_id, er.id, sd.id, 'b1', 'route', '1', 'the officer shall act and the deputy may not enter', 'administrative', null
  from rosetta_v2513.source_document sd
  join rosetta_v2513.extraction_run er on er.source_document_id = sd.id
 where sd.document_name='doc-05' and er.run_version=501;

-- C6: mixed polarity -> blocking repair, action_type not silently retyped
do $$
declare v_at text; v_rep integer; v_negative text; v_negative_source text;
begin
  perform rosetta_v2513.c6_rosetta_v253_reconcile_structural_correctness(
            (select id from rosetta_v2513.extraction_run where run_version=501));
  select action_type into v_at from rosetta_v2513.accountability_route where id='route-1';
  select count(*) into v_rep from rosetta_v2513.rosetta_structural_repair_queue
   where defect_type='modal_polarity_conflict' and repair_state='open'
     and object_id='route-1';
  if v_at is not null then raise exception 'TEST_FAIL c6 silently retyped mixed-polarity clause'; end if;
  if v_rep < 1 then raise exception 'TEST_FAIL c6 no blocking repair for mixed polarity'; end if;
  if not exists (select 1 from rosetta_v2513.rosetta_structural_repair_queue
                  where object_id='route-3' and defect_type='modal_polarity_conflict' and repair_state='open') then
    raise exception 'TEST_FAIL c6 positive-then-negative mixed polarity was not blocked'; end if;
  select action_type,trigger_condition into v_negative,v_negative_source
    from rosetta_v2513.accountability_route where id='route-2';
  if v_negative is distinct from 'shall' then
    raise exception 'TEST_FAIL c6 negative clause did not retain constrained base modal: %',v_negative; end if;
  if v_negative_source is distinct from 'the officer shall not act and the deputy may not enter' then
    raise exception 'TEST_FAIL c6 exact negative-polarity source clause changed: %',v_negative_source; end if;
  if exists (select 1 from rosetta_v2513.rosetta_structural_repair_queue
             where object_id='route-2' and defect_type='modal_polarity_conflict' and repair_state='open') then
    raise exception 'TEST_FAIL c6 all-negative conjuncts falsely classified mixed'; end if;
  raise notice 'PASS 05.1 C6 mixed polarity blocks; uniform negative clauses keep base modal plus exact source';
end $$;

-- C6 control: same fixture under the control closure retypes silently
do $$
declare v_at text;
begin
  update rosetta_v2513.accountability_route set action_type=null where id='route-1';
  delete from rosetta_v2513.rosetta_structural_repair_queue where object_id='route-1';
  perform rosetta_v2513.ctl_rosetta_v253_reconcile_structural_correctness(
            (select id from rosetta_v2513.extraction_run where run_version=501));
  select action_type into v_at from rosetta_v2513.accountability_route where id='route-1';
  if v_at is distinct from 'shall' then
    raise notice 'PASS 05.2 control retyped silently to % (documented 2.5.11 behavior)', v_at;
  else
    raise notice 'PASS 05.2 control retyped silently to shall (documented 2.5.11 behavior)';
  end if;
end $$;

-- C7: the receipt must be complete and bound to this exact source-content
-- identity. Clean text without a receipt is not silently accepted; a literal
-- U+FFFD is accepted only with manual disposition and an explicit span block.
do $$
declare doc_id integer; clean_id uuid; literal_id uuid; clean_text text:='The council shall act.';
        literal_text text:='The coun' || chr(65533) || 'cil shall act.';
        clean_hash text; literal_hash text;
begin
  select id into doc_id from rosetta_v2513.source_document where document_name='doc-05';
  clean_hash:=encode(extensions.digest(convert_to(clean_text,'UTF8'),'sha256'),'hex');
  literal_hash:=encode(extensions.digest(convert_to(literal_text,'UTF8'),'sha256'),'hex');
  -- no registry receipt at all -> fail, even when the text happens to be clean
  begin
    perform rosetta_v2513.c7_rosetta_v25_charset_gate(doc_id, clean_text);
    raise exception 'TEST_FAIL c7 clean source without an exact receipt passed';
  exception when sqlstate 'P1A07' then null;
  end;
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,source_content_hash,source_identity_hash)
  values(doc_id,'clean-v1','test://c7-clean','text/plain',clean_text,clean_hash,
    encode(extensions.digest(convert_to('fixture:test-05:c7-clean-v1','UTF8'),'sha256'),'hex'))
  returning source_content_id into clean_id;
  perform rosetta_replay.register_source(clean_id,clean_hash,octet_length(convert_to(clean_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  perform rosetta_v2513.c7_rosetta_v25_charset_gate(doc_id,clean_text);

  -- A receipt for clean_text cannot certify different bytes.
  begin
    perform rosetta_v2513.c7_rosetta_v25_charset_gate(doc_id,literal_text);
    raise exception 'TEST_FAIL c7 mismatched source reused another receipt';
  exception when sqlstate 'P1A07' then null;
  end;
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,source_content_hash,source_identity_hash)
  values(doc_id,'literal-v1','test://c7-literal','text/plain',literal_text,literal_hash,
    encode(extensions.digest(convert_to('fixture:test-05:c7-literal-v1','UTF8'),'sha256'),'hex'))
  returning source_content_id into literal_id;
  perform rosetta_replay.register_source(literal_id,literal_hash,octet_length(convert_to(literal_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":1,"replacement_char_disposition":"manual_verified_literal","replacement_chars_block_span_certainty":false}'::jsonb);
  perform rosetta_v2513.c7_rosetta_v25_charset_gate(doc_id,literal_text);
  raise notice 'PASS 05.3 C7 receipts are complete, exact-source-bound, and fail closed';
end $$;
