-- tests/07_end_to_end_replay.sql — exact deferred-member binding and gate order.
-- Transaction durability itself is proven only by 08_separated_transactions.py.
\set QUIET on

insert into rosetta_v2513.corpus(corpus_name) values('test-corpus-07');
insert into rosetta_v2513.source_document(corpus_id,document_name,document_type)
select id,'doc-07-deferred','statute' from rosetta_v2513.corpus where corpus_name='test-corpus-07';

do $$
declare
  v_doc integer;v_content uuid;v_source uuid;v_attempt uuid;v_manifest uuid;
  v_text text:=repeat('Sec. 1. The clerk shall retain the complete record. ',100);
  v_hash text;v_config text;v_closure text;v_state text;
begin
  select id into v_doc from rosetta_v2513.source_document where document_name='doc-07-deferred';
  v_hash:=encode(extensions.digest(convert_to(v_text,'UTF8'),'sha256'),'hex');
  insert into rosetta_v2513.source_document_content
    (source_document_id,source_version,source_url,media_type,source_text,
     source_content_hash,source_identity_hash,source_metadata)
  values(v_doc,'v1','test://07-deferred','text/plain',v_text,v_hash,
    encode(extensions.digest(convert_to('fixture:test-07:deferred-v1','UTF8'),'sha256'),'hex'),
    '{"text_extractor_version":"identity-text-v1"}'::jsonb)
  returning source_content_id into v_content;
  v_source:=rosetta_replay.register_source(v_content,v_hash,octet_length(convert_to(v_text,'UTF8')),
    '{"source_charset":"UTF-8","decoding_method":"strict_utf8","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  perform rosetta_replay.declare_source_expectation(v_source,'deferred_oversized',null,
    'none',null,false,'fixture is deliberately over the declared replay threshold');
  v_manifest:=rosetta_replay.seal_corpus('deferred-one',clock_timestamp()+interval '1 hour',
    1000,array[v_source]);

  v_config:=rosetta_replay.expected_configuration_hash(v_source);
  v_closure:=rosetta_replay.closure_sha256('v2513_');
  v_attempt:=rosetta_replay.replay_claim(v_source,'v2513_',
    'rosetta-v3-deterministic-sql-2.5.13',
    'rosetta-five-layer-structural-correctness-2.5.13',
    v_config,v_closure,'fixture-deferred');
  perform rosetta_replay.replay_defer(v_attempt,
    'source exceeds the immutable manifest byte threshold');
  perform rosetta_replay.replay_finalize(v_attempt,'fixture-deferred');
  select attempt_state into v_state from rosetta_replay.replay_attempt where attempt_id=v_attempt;
  if v_state<>'deferred_oversized' then
    raise exception 'TEST_FAIL deferred member state=%',v_state; end if;
  if not exists(select 1 from rosetta_replay.replay_run_binding
                where attempt_id=v_attempt and source_registry_id=v_source
                  and source_content_id=v_content and source_document_id=v_doc
                  and source_content_hash=v_hash
                  and terminal_outcome='deferred_oversized'
                  and extraction_run_id is null and output_content_hash is null) then
    raise exception 'TEST_FAIL deferred binding is incomplete or cross-source'; end if;

  -- G2 now passes for this member; G5 must be the next failure because no
  -- correction lane may be promoted without a declared exact negative control.
  begin
    perform rosetta_replay.promotion_gate_check(v_manifest,'v2513_',
      'rosetta-v3-deterministic-sql-2.5.13',
      'rosetta-five-layer-structural-correctness-2.5.13',
      rosetta_replay.configuration_contract_sha256(),v_closure,'not-loaded');
    raise exception 'TEST_FAIL promotion passed without C1-C7 negative controls';
  exception when sqlstate 'P1G15' then null;
  end;

  begin
    update rosetta_replay.replay_run_binding set terminal_outcome='completed'
    where attempt_id=v_attempt;
    raise exception 'TEST_FAIL replay binding is mutable';
  exception when raise_exception then
    if sqlerrm not like 'replay_run_binding_is_immutable%' then raise; end if;
  end;
  raise notice 'PASS 07 deferred source has an exact immutable binding and gates require C1-C7 controls';
end $$;

do $$
begin
  perform rosetta_replay.assert_cutover_authorized(gen_random_uuid(),gen_random_uuid());
  raise exception 'TEST_FAIL cutover allowed without exact promotion request binding';
exception when sqlstate 'P1C01' then
  raise notice 'PASS 07 cutover is impossible without exact bound authorization';
end $$;
