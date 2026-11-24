-- Security advisor 2026-11-24 05:58Z. Additive ACL/config only; no data change.
-- Two SECURITY DEFINER functions are executable by PUBLIC (so anon and
-- authenticated via /rest/v1/rpc). No application code calls them; the
-- server uses service_role, which keeps EXECUTE. Mirrors the 2026-07-31
-- lockdown already applied to the integer-id process_live_signal_through_gate,
-- including its guard: functions created manually in production can be absent
-- from a clean replay, and absence is already fail-closed.
do $lockdown$
declare
  function_signature text;
  function_oid regprocedure;
  lockdown_signatures constant text[] := array[
    'public.process_live_signal_through_gate(text,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb)',
    'public.run_signal_promotion_batch_v1(integer,text)'
  ];
  search_path_signatures constant text[] := array[
    'public.process_live_signal_through_gate(integer,text,text,text,text,text,numeric,text,timestamp with time zone,text,text,text,text,jsonb,jsonb,jsonb)',
    'public.docket_amendment_base_receipt_append_only()'
  ];
begin
  foreach function_signature in array lockdown_signatures loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise warning 'security target function is absent and therefore not executable: %', function_signature;
      continue;
    end if;
    execute format('revoke execute on function %s from public, anon, authenticated', function_oid);
    execute format('grant execute on function %s to service_role', function_oid);
  end loop;

  foreach function_signature in array search_path_signatures loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise warning 'search_path target function is absent: %', function_signature;
      continue;
    end if;
    execute format('alter function %s set search_path = pg_catalog, public', function_oid);
  end loop;
end
$lockdown$;
