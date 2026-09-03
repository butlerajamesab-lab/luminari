-- tests/06_manifest_diff_gates.sql — source truth, explicit corpus membership,
-- legacy-shortcut denial, and early promotion-gate failures.
\set QUIET on

insert into rosetta_v2513.corpus(corpus_name) values('test-corpus-06');
insert into rosetta_v2513.source_document(corpus_id,document_name,document_type)
select id,'doc-06-control','statute' from rosetta_v2513.corpus where corpus_name='test-corpus-06';
insert into rosetta_v2513.source_document(corpus_id,document_name,document_type)
select id,'doc-06-other','statute' from rosetta_v2513.corpus where corpus_name='test-corpus-06';

do $$
declare
  v_doc integer;v_other_doc integer;v_content uuid;v_other_content uuid;
  v_source uuid;v_other_source uuid;v_control integer;v_wrong_control integer;
  v_text text:='Sec. 1. The clerk shall file an annual verified report with the council.';
  v_other_text text:='Sec. 1. The mayor may publish an advisory report.';
  v_hash text;v_other_hash text;v_manifest uuid;v_manifest2 uuid;v_h1 text;v_h2 text;
  v_config text;v_closure text;
begin
  select id into v_doc from rosetta_v2513.source_document where document_name='doc-06-control';
  select id into v_other_doc from rosetta_v2513.source_document where document_name='doc-06-other';
  v_hash:=encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
  v_other_hash:=encode(extensions.digest(convert_to(v_other_text,'UTF8'),'sha256'),'hex');

  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_identity_hash,source_metadata)
  values(v_doc,'v1','test://06-control','text/plain',v_text,v_hash,
    encode(extensions.digest(convert_to('fixture:test-06:control-v1','UTF8'),'sha256'),'hex'),
    jsonb_build_object(
      'reference_date','2026-08-24',
      'reference_date_receipt',jsonb_build_object(
        'contract','rosetta-reference-date-receipt-v1',
        'reference_date','2026-08-24','basis','evaluation_as_of',
        'verified',true,'evidence_sha256',repeat('d',64)),
      'text_extractor_version','identity-text-v1'))
  returning source_content_id into v_content;
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_identity_hash,source_metadata)
  values(v_other_doc,'v1','test://06-other','text/plain',v_other_text,v_other_hash,
    encode(extensions.digest(convert_to('fixture:test-06:other-v1','UTF8'),'sha256'),'hex'),
    jsonb_build_object(
      'reference_date','2026-08-24',
      'reference_date_receipt',jsonb_build_object(
        'contract','rosetta-reference-date-receipt-v1',
        'reference_date','2026-08-24','basis','evaluation_as_of',
        'verified',true,'evidence_sha256',repeat('e',64)),
      'text_extractor_version','identity-text-v1'))
  returning source_content_id into v_other_content;

  v_source:=rosetta_replay.register_source(v_content,v_hash,octet_length(convert_to(v_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  v_other_source:=rosetta_replay.register_source(v_other_content,v_other_hash,octet_length(convert_to(v_other_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);

  v_config:=rosetta_replay.expected_configuration_hash(v_source);
  insert into rosetta_v2513.extraction_run
    (source_document_id,source_content_id,source_content_hash,run_version,
     engine_version,rule_set_version,rule_manifest_hash,configuration_hash,
     run_status,admissibility_state,output_content_hash)
  values(v_doc,v_content,v_hash,601,'control-engine','control-rules',repeat('a',64),
    v_config,'completed','admissible',repeat('b',64)) returning id into v_control;
  insert into rosetta_v2513.extraction_run
    (source_document_id,source_content_id,source_content_hash,run_version,
     engine_version,rule_set_version,rule_manifest_hash,configuration_hash,
     run_status,admissibility_state,output_content_hash)
  values(v_other_doc,v_other_content,v_other_hash,602,'control-engine','control-rules',repeat('a',64),
    rosetta_replay.expected_configuration_hash(v_other_source),'completed','admissible',repeat('c',64))
  returning id into v_wrong_control;

  -- A run from another source can never certify this member.
  begin
    perform rosetta_replay.declare_source_expectation(
      v_source,'completed',null,'admissible',v_wrong_control,false,
      'deliberately wrong source binding must fail');
    raise exception 'TEST_FAIL wrong-source control run accepted';
  exception when sqlstate 'P1B01' then null;
  end;
  perform rosetta_replay.declare_source_expectation(
    v_source,'completed',null,'admissible',v_control,false,
    'exact prior admissible source and run binding');

  -- Explicit scope cannot smuggle in an undeclared member.
  begin
    perform rosetta_replay.seal_corpus('bad-scope',clock_timestamp()+interval '1 hour',null,
      array[v_source,v_other_source]);
    raise exception 'TEST_FAIL manifest sealed with undeclared source';
  exception when sqlstate 'P1B02' then null;
  end;

  v_manifest:=rosetta_replay.seal_corpus('exact-one',clock_timestamp()+interval '1 hour',null,
    array[v_source]);
  v_manifest2:=rosetta_replay.seal_corpus('exact-one-repeat',clock_timestamp()+interval '1 hour',null,
    array[v_source]);
  select manifest_sha256 into v_h1 from rosetta_replay.sealed_corpus_manifest where manifest_id=v_manifest;
  select manifest_sha256 into v_h2 from rosetta_replay.sealed_corpus_manifest where manifest_id=v_manifest2;
  if v_h1 is distinct from v_h2 or not rosetta_replay.verify_sealed_manifest(v_manifest) then
    raise exception 'TEST_FAIL exact-scope manifest hash is not deterministic/verifiable';
  end if;

  -- Caller-supplied configuration and closure identities are recomputed.
  v_closure:=rosetta_replay.closure_sha256('v2513_');
  begin
    perform rosetta_replay.replay_claim(v_source,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      repeat('0',64),v_closure,'fixture');
    raise exception 'TEST_FAIL wrong configuration hash accepted';
  exception when sqlstate 'P1R13' then null;
  end;
  begin
    perform rosetta_replay.replay_claim(v_source,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      v_config,repeat('0',64),'fixture');
    raise exception 'TEST_FAIL wrong closure hash accepted';
  exception when sqlstate 'P1R14' then null;
  end;

  -- Same-transaction and unbound-diff shortcuts are intentionally dead.
  begin
    perform rosetta_replay.replay_one(v_source,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',v_config,v_closure,'fixture');
    raise exception 'TEST_FAIL replay_one shortcut still works';
  exception when sqlstate 'P1R30' then null;
  end;
  begin
    perform rosetta_replay.diff_runs(v_control,v_wrong_control);
    raise exception 'TEST_FAIL unbound diff shortcut still works';
  exception when sqlstate 'P1D04' then null;
  end;

  -- The gate cannot pass without exact terminal bindings, seven correction
  -- controls, full diffs, quarantine evidence, and bound authorization.
  begin
    perform rosetta_replay.promotion_gate_check(v_manifest,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      rosetta_replay.configuration_contract_sha256(),v_closure,'missing-set');
    raise exception 'TEST_FAIL empty evidence passed promotion gates';
  exception when sqlstate 'P1G12' then null;
  end;
  raise notice 'PASS 06 exact source/run expectations, explicit manifest, identity recomputation, and shortcut denial';
end $$;

do $$
begin
  update rosetta_replay.sealed_corpus_manifest set member_count=0;
  raise exception 'TEST_FAIL sealed manifest is mutable';
exception when raise_exception then
  if sqlerrm not like 'sealed_corpus_manifest_is_immutable%' then raise; end if;
  raise notice 'PASS 06 manifest is immutable';
end $$;

-- The former packet exercised a now-forbidden unbound diff helper.  Preserve
-- the useful behavioral coverage against the current source-bound classifier:
-- one deterministic status for every value/defect relationship, and no
-- improvement claim without a declared correction lane.
do $$
begin
  if rosetta_replay.classify_diff('the clerk','the clerk',null,null,null)
       is distinct from 'unchanged' then
    raise exception 'TEST_FAIL identical fields are not unchanged';
  end if;
  if rosetta_replay.classify_diff('The Clerk','the clerk',null,null,null)
       is distinct from 'neutral_relabel' then
    raise exception 'TEST_FAIL normalized-equivalent fields are not neutral relabels';
  end if;
  if rosetta_replay.classify_diff('REVISOR of statutes','the clerk','C2',
       'navigation_chrome',null) is distinct from 'improvement_declared' then
    raise exception 'TEST_FAIL evidenced C2 repair is not a declared improvement';
  end if;
  if rosetta_replay.classify_diff('REVISOR of statutes','the clerk',null,
       'navigation_chrome',null) is distinct from 'unexplained' then
    raise exception 'TEST_FAIL unattributed repair was labeled an improvement';
  end if;
  if rosetta_replay.classify_diff('the clerk',null,'C2',null,null)
       is distinct from 'regression' then
    raise exception 'TEST_FAIL removed field is not a regression';
  end if;
  if rosetta_replay.classify_diff('the clerk',repeat('x',1025),'C1',null,
       'actor_overflow') is distinct from 'regression' then
    raise exception 'TEST_FAIL newly defective actor is not a regression';
  end if;
  if rosetta_replay.actor_value_defect('entity_override',repeat('x',1025))
       is distinct from 'actor_overflow' then
    raise exception 'TEST_FAIL G6 overflow does not cover override actors';
  end if;
  if rosetta_replay.actor_value_defect('workflow_step',null)
       is distinct from 'actor_unresolved' then
    raise exception 'TEST_FAIL G6 null workflow actor is not unresolved';
  end if;
  if rosetta_replay.actor_value_defect('entity_override',null) is not null then
    raise exception 'TEST_FAIL optional null override actor was invented as a defect';
  end if;
  raise notice 'PASS 06 diff classification/attribution and G6 actor coverage';
end $$;
