-- Security advisor 2026-11-24 05:58Z. Additive ACL/config only; no data change.
-- Two SECURITY DEFINER functions are executable by PUBLIC (so anon and
-- authenticated via /rest/v1/rpc). No application code calls them; the
-- server uses service_role, which keeps EXECUTE. Mirrors the 2026-07-31
-- lockdown already applied to the integer-id process_live_signal_through_gate.
revoke execute on function public.process_live_signal_through_gate(
  text, text, text, text, text, text, numeric, text, timestamp with time zone,
  text, text, text, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.process_live_signal_through_gate(
  text, text, text, text, text, text, numeric, text, timestamp with time zone,
  text, text, text, text, jsonb, jsonb, jsonb
) to service_role;

revoke execute on function public.run_signal_promotion_batch_v1(integer, text)
  from public, anon, authenticated;
grant execute on function public.run_signal_promotion_batch_v1(integer, text)
  to service_role;

-- Pin search_path on the two functions the linter reports as mutable.
alter function public.process_live_signal_through_gate(
  integer, text, text, text, text, text, numeric, text, timestamp with time zone,
  text, text, text, text, jsonb, jsonb, jsonb
) set search_path = pg_catalog, public;
alter function public.docket_amendment_base_receipt_append_only()
  set search_path = pg_catalog, public;
