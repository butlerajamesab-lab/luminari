-- Close the browser-executable SECURITY DEFINER boundary for Lighthouse-owned
-- mutation functions.
--
-- These functions mutate operational queues, signal/pattern/trend/strategy
-- state, Atlas bridge state, geocode work, registry enrichment, or L-layer
-- state. They are service-owned procedures and must not be callable through
-- PostgREST by anonymous or ordinary authenticated browser roles.
--
-- This migration changes privileges only. It does not alter function bodies,
-- source rows, canonical data, triggers, scheduler state, or evidence.

begin;

do $lockdown$
declare
  function_signature text;
  function_oid regprocedure;
  target_signatures constant text[] := array[
    'public.apply_registry_program_crosswalk_enrichment(text)',
    'public.claim_geocode_queue_batch(integer,integer)',
    'public.claim_geocode_queue_batch_secure(text,integer,integer)',
    'public.create_atlas_signal_chain(jsonb)',
    'public.debug_claim_geocode_context(integer,integer,boolean)',
    'public.debug_geocode_candidate_probe(text)',
    'public.detect_signals_from_stream(text,integer)',
    'public.evaluate_and_promote_signal(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,uuid,uuid[])',
    'public.evaluate_and_promote_signal(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,text,text,text,text,text,text,jsonb,jsonb,jsonb)',
    'public.finalize_geocode_queue_item_secure(text,bigint,text,double precision,double precision,text)',
    'public.l3_set_spark(uuid,text,double precision)',
    'public.l4_faith_operation(uuid,double precision)',
    'public.l4_initialize(double precision,double precision,double precision)',
    'public.l4_recompute(uuid)',
    'public.l4_set_filters(uuid,double precision,double precision,double precision)',
    'public.l8_process_feedback(uuid,jsonb,jsonb,boolean,text,double precision)',
    'public.l_transition(uuid,integer,text,jsonb)',
    'public.process_live_signal_through_gate(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb)',
    'public.queue_storage_object_for_corpus_import_object(text,text,jsonb,timestamp with time zone,timestamp with time zone)',
    'public.queue_storage_object_for_corpus_import_trigger()',
    'public.run_pattern_engine(integer,integer)',
    'public.run_strategy_engine()',
    'public.run_trend_engine()',
    'public.seal_pattern_engine_run(bigint)',
    'public.seal_pattern_engine_run(uuid)',
    'public.seal_strategy_engine_run(bigint)',
    'public.seal_strategy_engine_run(uuid)',
    'public.seal_trend_engine_run(bigint)',
    'public.seal_trend_engine_run(uuid)',
    'public.seal_trend_snapshot(text)',
    'public.sync_state_enriched_bucket_to_corpus_import_queue()',
    'public.trg_registry_programs_apply_crosswalk()',
    'public.verify_geocode_worker_cron_secret(text)'
  ];
begin
  foreach function_signature in array target_signatures loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'runtime security target function is missing: %', function_signature;
    end if;

    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_oid
    );
    execute format(
      'grant execute on function %s to service_role',
      function_oid
    );
  end loop;
end
$lockdown$;

commit;
