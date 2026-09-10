begin;

-- Legacy resource snapshot functions pass text directly to digest(), while
-- pgcrypto is installed in the protected extensions schema.  Preserve their
-- deterministic UTF-8 hashing without widening the extensions search_path.
-- Existing production callers use named arguments data/type. PostgreSQL does
-- not allow CREATE OR REPLACE to rename them. Preserve catalog argument names
-- and the function OID, while using positional references in the new body.
do $bridge$
declare argument_names text[];
begin
  select proargnames into argument_names from pg_proc
    where oid=to_regprocedure('public.digest(text,text)');
  execute format($definition$
create or replace function public.digest(%I text, %I text)
returns bytea
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, extensions
as $body$
  select extensions.digest(pg_catalog.convert_to($1, 'UTF8'), $2);
$body$;
$definition$,coalesce(nullif(argument_names[1],''),'p_value'),
  coalesce(nullif(argument_names[2],''),'p_algorithm'));
end;
$bridge$;

revoke all on function public.digest(text, text)
  from public, anon, authenticated;
grant execute on function public.digest(text, text)
  to service_role;

comment on function public.digest(text, text) is
  'Service-only compatibility bridge for deterministic legacy text hashing through extensions.digest.';

-- PostgreSQL has advisory-lock overloads for bigint and for (integer,
-- integer), but not for the (integer, bigint) pair used by the legacy intake
-- binder.  Hash the complete pair into the supported bigint lock namespace.
do $bridge$
declare argument_names text[];
begin
  select proargnames into argument_names from pg_proc
    where oid=to_regprocedure('public.pg_advisory_xact_lock(integer,bigint)');
  execute format($definition$
create or replace function public.pg_advisory_xact_lock(%I integer, %I bigint)
returns void
language sql
volatile
strict
set search_path = pg_catalog
as $body$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended($1::text || ':' || $2::text, 0)
  );
$body$;
$definition$,coalesce(nullif(argument_names[1],''),'p_namespace'),
  coalesce(nullif(argument_names[2],''),'p_key'));
end;
$bridge$;

revoke all on function public.pg_advisory_xact_lock(integer, bigint)
  from public, anon, authenticated;
grant execute on function public.pg_advisory_xact_lock(integer, bigint)
  to service_role;

comment on function public.pg_advisory_xact_lock(integer, bigint) is
  'Service-only compatibility overload that maps a legacy namespace/bigint pair to one deterministic transaction advisory lock key.';

commit;
