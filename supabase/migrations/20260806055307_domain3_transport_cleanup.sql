begin;

revoke all on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  to service_role;

drop function if exists public.signal_bridge_transport_probe_v1(text);

comment on function public.register_live_data_signal_transport_receipt_v2(jsonb, text) is
  'Retained service-role-only compatibility wrapper. External Atlas Domain 3 registration uses the token-gated Lighthouse Render route and direct PostgreSQL canonical receipt boundary.';

notify pgrst, 'reload schema';

commit;
