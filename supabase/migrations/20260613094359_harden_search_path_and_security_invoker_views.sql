-- Harden every tracked function/view that exists in this replay. Several
-- targets were created outside the historical ledger, so absence is not a
-- reason to abort hardening of the remaining security boundaries.
do $hardening$
declare
  function_signature text;
  function_oid regprocedure;
  view_name text;
begin
  foreach function_signature in array array[
    'public.set_registry_checkpoint_updated_at()',
    'public.advance_registry_checkpoint(text,integer,text,text)',
    'public.claim_corpus_import_queue_row(text,text,integer)',
    'public.heartbeat_corpus_import_queue_row(bigint,text,integer)',
    'public.mark_corpus_import_queue_extract_success(bigint,text,text,jsonb)',
    'public.mark_corpus_import_queue_normalize_success(bigint,text,text,jsonb)',
    'public.mark_corpus_import_queue_route_dry_run_success(bigint,text,jsonb)',
    'public.mark_corpus_import_queue_failure(bigint,text,text,text,boolean,jsonb)'
  ] loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is not null then
      execute format(
        'alter function %s set search_path = public',
        function_oid
      );
    end if;
  end loop;

  foreach view_name in array array[
    'v_lighthouse_map_layer1',
    'v_lighthouse_map_layer2',
    'v_civic_map_signals_production',
    'v_jurisdiction_assertion_queue',
    'v_current_jurisdiction_coverage_items'
  ] loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = view_name
        and c.relkind = 'v'
    ) then
      execute format(
        'alter view public.%I set (security_invoker = true)',
        view_name
      );
    end if;
  end loop;
end
$hardening$;
