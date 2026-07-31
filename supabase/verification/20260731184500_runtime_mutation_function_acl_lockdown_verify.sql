-- Read-only acceptance verification for the Lighthouse runtime mutation ACL.
-- Expected result: every row reports false/false/false/true for
-- public/anon/authenticated/service_role execute privileges.

with target_signatures(function_signature) as (
  values
    ('public.apply_registry_program_crosswalk_enrichment(text)'),
    ('public.claim_geocode_queue_batch(integer,integer)'),
    ('public.claim_geocode_queue_batch_secure(text,integer,integer)'),
    ('public.create_atlas_signal_chain(jsonb)'),
    ('public.debug_claim_geocode_context(integer,integer,boolean)'),
    ('public.debug_geocode_candidate_probe(text)'),
    ('public.detect_signals_from_stream(text,integer)'),
    ('public.evaluate_and_promote_signal(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,uuid,uuid[])'),
    ('public.evaluate_and_promote_signal(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,text,text,text,text,text,text,jsonb,jsonb,jsonb)'),
    ('public.finalize_geocode_queue_item_secure(text,bigint,text,double precision,double precision,text)'),
    ('public.l3_set_spark(uuid,text,double precision)'),
    ('public.l4_faith_operation(uuid,double precision)'),
    ('public.l4_initialize(double precision,double precision,double precision)'),
    ('public.l4_recompute(uuid)'),
    ('public.l4_set_filters(uuid,double precision,double precision,double precision)'),
    ('public.l8_process_feedback(uuid,jsonb,jsonb,boolean,text,double precision)'),
    ('public.l_transition(uuid,integer,text,jsonb)'),
    ('public.process_live_signal_through_gate(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb)'),
    ('public.queue_storage_object_for_corpus_import_object(text,text,jsonb,timestamp with time zone,timestamp with time zone)'),
    ('public.queue_storage_object_for_corpus_import_trigger()'),
    ('public.run_pattern_engine(integer,integer)'),
    ('public.run_strategy_engine()'),
    ('public.run_trend_engine()'),
    ('public.seal_pattern_engine_run(bigint)'),
    ('public.seal_pattern_engine_run(uuid)'),
    ('public.seal_strategy_engine_run(bigint)'),
    ('public.seal_strategy_engine_run(uuid)'),
    ('public.seal_trend_engine_run(bigint)'),
    ('public.seal_trend_engine_run(uuid)'),
    ('public.seal_trend_snapshot(text)'),
    ('public.sync_state_enriched_bucket_to_corpus_import_queue()'),
    ('public.trg_registry_programs_apply_crosswalk()'),
    ('public.verify_geocode_worker_cron_secret(text)')
), resolved as (
  select
    function_signature,
    to_regprocedure(function_signature) as function_oid
  from target_signatures
), privilege_state as (
  select
    function_signature,
    function_oid,
    function_oid is not null as function_exists,
    case when function_oid is null then null
      else has_function_privilege('public', function_oid, 'execute') end
      as public_execute,
    case when function_oid is null then null
      else has_function_privilege('anon', function_oid, 'execute') end
      as anon_execute,
    case when function_oid is null then null
      else has_function_privilege('authenticated', function_oid, 'execute') end
      as authenticated_execute,
    case when function_oid is null then null
      else has_function_privilege('service_role', function_oid, 'execute') end
      as service_role_execute
  from resolved
)
select *
from privilege_state
order by function_signature;

do $verify$
begin
  if exists (
    with target_signatures(function_signature) as (
      values
        ('public.apply_registry_program_crosswalk_enrichment(text)'),
        ('public.claim_geocode_queue_batch(integer,integer)'),
        ('public.claim_geocode_queue_batch_secure(text,integer,integer)'),
        ('public.create_atlas_signal_chain(jsonb)'),
        ('public.debug_claim_geocode_context(integer,integer,boolean)'),
        ('public.debug_geocode_candidate_probe(text)'),
        ('public.detect_signals_from_stream(text,integer)'),
        ('public.evaluate_and_promote_signal(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb,text,text,text,uuid,uuid[])'),
        ('public.evaluate_and_promote_signal(uuid,text,text,text,text,text,numeric,text,text,timestamp with time zone,text,text,text,text,text,text,jsonb,jsonb,jsonb)'),
        ('public.finalize_geocode_queue_item_secure(text,bigint,text,double precision,double precision,text)'),
        ('public.l3_set_spark(uuid,text,double precision)'),
        ('public.l4_faith_operation(uuid,double precision)'),
        ('public.l4_initialize(double precision,double precision,double precision)'),
        ('public.l4_recompute(uuid)'),
        ('public.l4_set_filters(uuid,double precision,double precision,double precision)'),
        ('public.l8_process_feedback(uuid,jsonb,jsonb,boolean,text,double precision)'),
        ('public.l_transition(uuid,integer,text,jsonb)'),
        ('public.process_live_signal_through_gate(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb)'),
        ('public.queue_storage_object_for_corpus_import_object(text,text,jsonb,timestamp with time zone,timestamp with time zone)'),
        ('public.queue_storage_object_for_corpus_import_trigger()'),
        ('public.run_pattern_engine(integer,integer)'),
        ('public.run_strategy_engine()'),
        ('public.run_trend_engine()'),
        ('public.seal_pattern_engine_run(bigint)'),
        ('public.seal_pattern_engine_run(uuid)'),
        ('public.seal_strategy_engine_run(bigint)'),
        ('public.seal_strategy_engine_run(uuid)'),
        ('public.seal_trend_engine_run(bigint)'),
        ('public.seal_trend_engine_run(uuid)'),
        ('public.seal_trend_snapshot(text)'),
        ('public.sync_state_enriched_bucket_to_corpus_import_queue()'),
        ('public.trg_registry_programs_apply_crosswalk()'),
        ('public.verify_geocode_worker_cron_secret(text)')
    )
    select 1
    from target_signatures
    where to_regprocedure(function_signature) is null
       or has_function_privilege('public', to_regprocedure(function_signature), 'execute')
       or has_function_privilege('anon', to_regprocedure(function_signature), 'execute')
       or has_function_privilege('authenticated', to_regprocedure(function_signature), 'execute')
       or not has_function_privilege('service_role', to_regprocedure(function_signature), 'execute')
  ) then
    raise exception 'runtime mutation function ACL verification failed';
  end if;
end
$verify$;
