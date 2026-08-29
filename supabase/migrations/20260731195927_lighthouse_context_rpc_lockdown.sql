-- get_lighthouse_context_view exposes case descriptions, owner references,
-- detected signals, and snapshot identifiers for an arbitrary jurisdiction.
-- It is an internal service context projection, not a public PostgREST RPC.

begin;

do $lockdown$
declare
  target_function regprocedure :=
    to_regprocedure('public.get_lighthouse_context_view(text)');
begin
  -- Historical production contained this internal RPC without checked-in
  -- creating DDL. Its absence in a fresh replay is already fail-closed.
  if target_function is not null then
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      target_function
    );
    execute format(
      'grant execute on function %s to service_role',
      target_function
    );
    execute format(
      'alter function %s set search_path = pg_catalog, public',
      target_function
    );
  end if;
end
$lockdown$;

commit;
