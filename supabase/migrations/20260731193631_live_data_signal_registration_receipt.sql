-- Explicit JSON receipt for Atlas Domain 3 registration.

create or replace function public.register_live_data_signal_receipt_v1(
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_live_data_signal_id uuid;
  v_signal_hash text;
begin
  v_live_data_signal_id := public.register_live_data_signal_v1(p_record);

  if v_live_data_signal_id is null then
    raise exception 'live-data signal registration returned no identity';
  end if;

  select signal_hash
    into v_signal_hash
    from public.live_data_signals
   where live_data_signal_id = v_live_data_signal_id;

  if v_signal_hash is null then
    raise exception 'registered live-data signal could not be read back: %',
      v_live_data_signal_id;
  end if;

  return jsonb_build_object(
    'live_data_signal_id', v_live_data_signal_id,
    'signal_hash', v_signal_hash,
    'governance_status', (
      select governance_status
      from public.live_data_signals
      where live_data_signal_id = v_live_data_signal_id
    ),
    'registered_at', clock_timestamp()
  );
end
$function$;

revoke all on function public.register_live_data_signal_receipt_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.register_live_data_signal_receipt_v1(jsonb)
  to service_role;

comment on function public.register_live_data_signal_receipt_v1(jsonb) is
  'Service-role-only cross-project receipt for deterministic Atlas Domain 3 registration.';
