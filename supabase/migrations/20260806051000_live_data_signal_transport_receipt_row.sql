begin
create or replace function public.register_live_data_signal_transport_receipt_v1(
  p_record jsonb
)
returns table (
  live_data_signal_id uuid,
  signal_hash text,
  governance_status text,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_receipt jsonb;
begin
  v_receipt := public.register_live_data_signal_receipt_v1(p_record);

  if v_receipt is null
     or nullif(v_receipt->>'live_data_signal_id', '') is null
     or nullif(v_receipt->>'signal_hash', '') is null then
    raise exception 'live_data_signal_transport_receipt_incomplete';
  end if;

  return query
  select
    (v_receipt->>'live_data_signal_id')::uuid,
    v_receipt->>'signal_hash',
    v_receipt->>'governance_status',
    coalesce(
      nullif(v_receipt->>'registered_at', '')::timestamptz,
      clock_timestamp()
    );
end;
$$
revoke all on function public.register_live_data_signal_transport_receipt_v1(jsonb)
  from public, anon, authenticated
grant execute on function public.register_live_data_signal_transport_receipt_v1(jsonb)
  to service_role
comment on function public.register_live_data_signal_transport_receipt_v1(jsonb) is
  'Row-shaped service-role-only receipt boundary for Atlas Domain 3 transport. It delegates canonical registration to register_live_data_signal_receipt_v1 and exposes an explicit PostgREST result row.'
notify pgrst, 'reload schema'
commit
