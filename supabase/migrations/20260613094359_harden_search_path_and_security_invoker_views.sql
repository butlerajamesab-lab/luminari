alter function public.set_registry_checkpoint_updated_at() set search_path = public;
alter function public.advance_registry_checkpoint(text, integer, text, text) set search_path = public;
alter function public.claim_corpus_import_queue_row(text, text, integer) set search_path = public;
alter function public.heartbeat_corpus_import_queue_row(bigint, text, integer) set search_path = public;
alter function public.mark_corpus_import_queue_extract_success(bigint, text, text, jsonb) set search_path = public;
alter function public.mark_corpus_import_queue_normalize_success(bigint, text, text, jsonb) set search_path = public;
alter function public.mark_corpus_import_queue_route_dry_run_success(bigint, text, jsonb) set search_path = public;
alter function public.mark_corpus_import_queue_failure(bigint, text, text, text, boolean, jsonb) set search_path = public;

alter view public.v_lighthouse_map_layer1 set (security_invoker = true);
alter view public.v_lighthouse_map_layer2 set (security_invoker = true);
alter view public.v_civic_map_signals_production set (security_invoker = true);
alter view public.v_jurisdiction_assertion_queue set (security_invoker = true);
alter view public.v_current_jurisdiction_coverage_items set (security_invoker = true);
