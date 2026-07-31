-- get_lighthouse_context_view exposes case descriptions, owner references,
-- detected signals, and snapshot identifiers for an arbitrary jurisdiction.
-- It is an internal service context projection, not a public PostgREST RPC.

begin;

revoke execute on function public.get_lighthouse_context_view(text)
  from public, anon, authenticated;
grant execute on function public.get_lighthouse_context_view(text)
  to service_role;

alter function public.get_lighthouse_context_view(text)
  set search_path = pg_catalog, public;

commit;
