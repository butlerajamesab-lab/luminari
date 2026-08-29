begin;

-- The direct Render route is now the active Atlas Domain 3 transport. Keep the
-- token-gated PostgREST wrapper as a private service-role compatibility receipt,
-- but remove anonymous gateway execution so there is one active external path.
revoke all on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  from public, anon, authenticated;

grant execute on function public.register_live_data_signal_transport_receipt_v2(jsonb, text)
  to service_role;

-- Remove the temporary diagnostic used to prove Lighthouse's project-wide
-- PostgREST zero-row boundary. It was never an application contract.
drop function if exists public.signal_bridge_transport_probe_v1(text);

comment on function public.register_live_data_signal_transport_receipt_v2(jsonb, text) is
  'Retained service-role-only compatibility wrapper. External Atlas Domain 3 registration uses the token-gated Lighthouse Render route and direct PostgreSQL canonical receipt boundary.';

notify pgrst, 'reload schema';

commit;
