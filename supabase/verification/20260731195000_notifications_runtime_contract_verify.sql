-- Read-only acceptance verification for the notification runtime contract.

select
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'notifications'
order by c.ordinal_position;

select
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as force_rls,
  has_table_privilege('public', cls.oid, 'select,insert,update,delete') as public_has_data_privileges,
  has_table_privilege('anon', cls.oid, 'select,insert,update,delete') as anon_has_data_privileges,
  has_table_privilege('authenticated', cls.oid, 'select,insert,update,delete') as authenticated_has_data_privileges,
  has_table_privilege('service_role', cls.oid, 'select,insert,update,delete') as service_role_has_all_data_privileges
from pg_class cls
join pg_namespace ns on ns.oid = cls.relnamespace
where ns.nspname = 'public'
  and cls.relname = 'notifications';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'notifications'
order by policyname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'notifications'
order by indexname;

select
  count(*)::int as row_count,
  count(*) filter (
    where user_id is null
       or type is null
       or title is null
       or message is null
       or created_at is null
  )::int as invalid_required_row_count
from public.notifications;

do $verify$
declare
  required_columns constant text[] := array[
    'id', 'user_id', 'type', 'title', 'message',
    'metadata', 'link_url', 'read_at', 'created_at'
  ];
  column_name text;
begin
  foreach column_name in array required_columns loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and information_schema.columns.column_name = column_name
    ) then
      raise exception 'notification runtime column missing: %', column_name;
    end if;
  end loop;

  if exists (
    select 1
    from public.notifications
    where user_id is null
       or type is null
       or title is null
       or message is null
       or created_at is null
  ) then
    raise exception 'notification runtime contains invalid required rows';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  ) then
    raise exception 'notification runtime must remain server-mediated without browser policies';
  end if;

  if has_table_privilege('public', 'public.notifications', 'select')
     or has_table_privilege('public', 'public.notifications', 'insert')
     or has_table_privilege('public', 'public.notifications', 'update')
     or has_table_privilege('public', 'public.notifications', 'delete')
     or has_table_privilege('anon', 'public.notifications', 'select')
     or has_table_privilege('anon', 'public.notifications', 'insert')
     or has_table_privilege('anon', 'public.notifications', 'update')
     or has_table_privilege('anon', 'public.notifications', 'delete')
     or has_table_privilege('authenticated', 'public.notifications', 'select')
     or has_table_privilege('authenticated', 'public.notifications', 'insert')
     or has_table_privilege('authenticated', 'public.notifications', 'update')
     or has_table_privilege('authenticated', 'public.notifications', 'delete') then
    raise exception 'notification runtime browser table grants remain open';
  end if;

  if not has_table_privilege('service_role', 'public.notifications', 'select')
     or not has_table_privilege('service_role', 'public.notifications', 'insert')
     or not has_table_privilege('service_role', 'public.notifications', 'update')
     or not has_table_privilege('service_role', 'public.notifications', 'delete') then
    raise exception 'notification runtime service_role grants are incomplete';
  end if;
end
$verify$;
