begin;

-- Legacy resource snapshot functions pass text directly to digest(), while
-- pgcrypto is installed in the protected extensions schema.  Preserve their
-- deterministic UTF-8 hashing without widening the extensions search_path.
create or replace function public.digest(
  p_value text,
  p_algorithm text
)
returns bytea
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, extensions
as $$
  select extensions.digest(pg_catalog.convert_to(p_value, 'UTF8'), p_algorithm);
$$;

revoke all on function public.digest(text, text)
  from public, anon, authenticated;
grant execute on function public.digest(text, text)
  to service_role;

comment on function public.digest(text, text) is
  'Service-only compatibility bridge for deterministic legacy text hashing through extensions.digest.';

-- PostgreSQL has advisory-lock overloads for bigint and for (integer,
-- integer), but not for the (integer, bigint) pair used by the legacy intake
-- binder.  Hash the complete pair into the supported bigint lock namespace.
create or replace function public.pg_advisory_xact_lock(
  p_namespace integer,
  p_key bigint
)
returns void
language sql
volatile
strict
set search_path = pg_catalog
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_namespace::text || ':' || p_key::text, 0)
  );
$$;

revoke all on function public.pg_advisory_xact_lock(integer, bigint)
  from public, anon, authenticated;
grant execute on function public.pg_advisory_xact_lock(integer, bigint)
  to service_role;

comment on function public.pg_advisory_xact_lock(integer, bigint) is
  'Service-only compatibility overload that maps a legacy namespace/bigint pair to one deterministic transaction advisory lock key.';

commit;
