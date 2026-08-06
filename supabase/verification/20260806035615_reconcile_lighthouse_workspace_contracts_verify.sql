-- Lighthouse workspace contract verification.
-- Read-only. Safe to run repeatedly after the matching migration.

begin;
set local transaction_read_only = on;

do $verify$
declare
  missing_columns text[];
  missing_indexes text[];
begin
  select pg_catalog.array_agg(required.column_name order by required.column_name)
    into missing_columns
    from (
      values
        ('access_count'),
        ('created_at'),
        ('expires_at'),
        ('label'),
        ('last_accessed_at'),
        ('permissions'),
        ('revoked_at')
    ) as required(column_name)
   where not exists (
     select 1
       from information_schema.columns columns
      where columns.table_schema = 'public'
        and columns.table_name = 'share_links'
        and columns.column_name = required.column_name
   );

  if missing_columns is not null then
    raise exception 'share_links workspace columns are missing: %', missing_columns;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace
        on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relname = 'share_links'
       and relation.relrowsecurity
  ) then
    raise exception 'share_links RLS is not enabled';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conrelid = 'public.share_links'::regclass
       and constraint_record.conname = 'share_links_permissions_check'
       and constraint_record.convalidated
  ) then
    raise exception 'share_links permissions constraint is missing or unvalidated';
  end if;

  select pg_catalog.array_agg(required.index_name order by required.index_name)
    into missing_indexes
    from (
      values
        ('idx_share_case'),
        ('idx_share_created_by'),
        ('idx_share_expires'),
        ('idx_share_token')
    ) as required(index_name)
   where pg_catalog.to_regclass('public.' || required.index_name) is null;

  if missing_indexes is not null then
    raise exception 'share_links workspace indexes are missing: %', missing_indexes;
  end if;

  if pg_catalog.has_table_privilege(
       'public', 'public.share_links',
       'select,insert,update,delete,truncate,references,trigger'
     ) then
    raise exception 'PUBLIC retains direct share_links privileges';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and pg_catalog.has_table_privilege(
       'anon', 'public.share_links',
       'select,insert,update,delete,truncate,references,trigger'
     ) then
    raise exception 'anon retains direct share_links privileges';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and pg_catalog.has_table_privilege(
       'authenticated', 'public.share_links',
       'select,insert,update,delete,truncate,references,trigger'
     ) then
    raise exception 'authenticated retains direct share_links privileges';
  end if;

  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not pg_catalog.has_table_privilege(
       'service_role', 'public.share_links',
       'select,insert,update,delete,truncate,references,trigger'
     ) then
    raise exception 'service_role is missing required share_links privileges';
  end if;
end
$verify$;

select
  pg_catalog.to_regclass('public.share_links')::text as relation_name,
  count(*)::bigint as current_row_count
from public.share_links;

rollback;
