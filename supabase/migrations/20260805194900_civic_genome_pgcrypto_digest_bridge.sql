begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.digest(
  p_value bytea,
  p_algorithm text
)
returns bytea
language sql
immutable
strict
set search_path = pg_catalog, extensions
as $$
  select extensions.digest(p_value, p_algorithm);
$$;

revoke all on function public.digest(bytea, text)
  from public, anon, authenticated;
grant execute on function public.digest(bytea, text)
  to service_role;

comment on function public.digest(bytea, text) is
  'Compatibility bridge to extensions.digest for existing deterministic database functions with fixed pg_catalog,public search paths. It performs no interpretation and preserves pgcrypto output exactly.';

commit;
