-- tests/01_durability.sql — Phase 0 durability behaviors
\set QUIET on
\pset footer off

-- 1. idempotent registration: same (id, hash) returns same registry id
do $$
declare a uuid; b uuid; cid uuid := gen_random_uuid();
begin
  a := rosetta_replay.register_source(cid, repeat('a',64), 100,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  b := rosetta_replay.register_source(cid, repeat('a',64), 100,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  if a is distinct from b then raise exception 'TEST_FAIL idempotent registration'; end if;
  raise notice 'PASS 01.1 idempotent registration';
end $$;

-- 2. registration requires a real sha256 and a charset receipt (C7 fields)
do $$
begin
  perform rosetta_replay.register_source(gen_random_uuid(), 'notahash', 1,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  raise exception 'TEST_FAIL bad hash accepted';
exception when sqlstate '22023' then raise notice 'PASS 01.2 hash shape enforced';
end $$;

-- 3. registry immutability
do $$
begin
  update rosetta_replay.replay_source_registry set source_byte_length = 0;
  raise exception 'TEST_FAIL registry update allowed';
exception when raise_exception then
  if sqlerrm not like 'rosetta_replay_source_registry_is_immutable%' then raise; end if;
  raise notice 'PASS 01.3 registry immutable';
end $$;

-- 4. durable claim + finalize success; re-claim of terminal identity returns same attempt
do $$
declare rid uuid; att1 uuid; att2 uuid; st text;
begin
  rid := rosetta_replay.register_source(gen_random_uuid(), repeat('b',64), 10,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  att1 := rosetta_replay.claim_attempt(rid,'eng','rs','cfg','clo','worker-1');
  perform rosetta_replay.finalize_attempt(att1,'success');
  att2 := rosetta_replay.claim_attempt(rid,'eng','rs','cfg','clo','worker-2');
  if att1 is distinct from att2 then raise exception 'TEST_FAIL re-claim created new attempt'; end if;
  select attempt_state into st from rosetta_replay.replay_attempt where attempt_id = att1;
  if st <> 'succeeded' then raise exception 'TEST_FAIL terminal state'; end if;
  raise notice 'PASS 01.4 durable claim/finalize/suppression of identical identity';
end $$;

-- 5. failure classification: deadlock retryable, timeout not, connection retryable
do $$
declare c record;
begin
  select * into c from rosetta_replay.classify_failure('40P01');
  if not (c.failure_class='deadlock' and c.is_retryable) then raise exception 'TEST_FAIL deadlock class'; end if;
  select * into c from rosetta_replay.classify_failure('57014');
  if not (c.failure_class='timeout' and not c.is_retryable) then raise exception 'TEST_FAIL timeout class'; end if;
  select * into c from rosetta_replay.classify_failure('08006');
  if not (c.failure_class='connection' and c.is_retryable) then raise exception 'TEST_FAIL connection class'; end if;
  select * into c from rosetta_replay.classify_failure('P0001');
  if not (c.failure_class='deterministic_validation' and not c.is_retryable) then raise exception 'TEST_FAIL deterministic class'; end if;
  raise notice 'PASS 01.5 failure classification';
end $$;

-- 6. forced timeout is durably receipted as timed_out, never silent
-- statement_timeout must be set at transaction level (SET LOCAL outside the DO
-- block); inside a PL/pgSQL block its effect is scoped to the block.
set local statement_timeout = '50ms';
do $$
declare rid uuid; att uuid; st text; v_st text;
begin
  rid := rosetta_replay.register_source(gen_random_uuid(), repeat('c',64), 10,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  att := rosetta_replay.claim_attempt(rid,'eng-timeout','rs','cfg','clo','worker-t');
  begin
    perform pg_sleep(0.2);
  exception when query_canceled then
    get stacked diagnostics v_st = returned_sqlstate;
    perform rosetta_replay.finalize_attempt(att,'timeout', v_st, sqlerrm, 'worker-t');
  end;
  select attempt_state into st from rosetta_replay.replay_attempt where attempt_id = att;
  if st <> 'timed_out' then raise exception 'TEST_FAIL timeout state %', st; end if;
  if not exists (select 1 from rosetta_replay.replay_receipt
                 where attempt_id = att and receipt_kind='timeout' and sqlstate='57014') then
    raise exception 'TEST_FAIL timeout receipt missing';
  end if;
  raise notice 'PASS 01.6 forced timeout durable receipt';
end $$;
reset statement_timeout;

-- 7. receipts are append-only
do $$
begin
  delete from rosetta_replay.replay_receipt;
  raise exception 'TEST_FAIL receipt delete allowed';
exception when raise_exception then
  if sqlerrm not like 'rosetta_replay_receipt_is_append_only%' then raise; end if;
  raise notice 'PASS 01.7 receipts append-only';
end $$;

-- 8. retryable failure can be re-finalized; terminal cannot
do $$
declare rid uuid; att uuid;
begin
  rid := rosetta_replay.register_source(gen_random_uuid(), repeat('d',64), 10,
        '{"source_charset":"UTF-8","decoding_method":"strict","invalid_byte_handling":"reject","replacement_char_count":0,"replacement_chars_block_span_certainty":false}'::jsonb);
  att := rosetta_replay.claim_attempt(rid,'eng-r','rs','cfg','clo');
  perform rosetta_replay.finalize_attempt(att,'retryable_failure','40P01','deadlock');
  perform rosetta_replay.finalize_attempt(att,'success');  -- allowed: was not terminal
  begin
    perform rosetta_replay.finalize_attempt(att,'success');
    raise exception 'TEST_FAIL double terminal finalize allowed';
  exception when raise_exception then
    if sqlerrm not like '%already terminal%' then raise; end if;
  end;
  raise notice 'PASS 01.8 retryable vs terminal finalize';
end $$;
