-- The audit log existed before its timestamp conversion was tracked. Restore
-- the exact pre-conversion storage contract so the historical conversion and
-- later sequence-alignment migration can execute from a clean database.
create table if not exists public.admin_change_log (
  id serial primary key,
  admin_id_acl text,
  admin_name_acl text,
  action_type_acl text,
  target_system_acl text,
  target_id_acl text,
  previous_state_acl text,
  new_state_acl text,
  description_acl text,
  timestamp_acl bigint,
  rollback_available_acl integer,
  rolled_back_acl integer,
  rollback_data_acl text
);

alter table public.admin_change_log enable row level security;

revoke all on table public.admin_change_log from anon, authenticated;
grant select on table public.admin_change_log to authenticated;
grant all on table public.admin_change_log to service_role;
revoke all on sequence public.admin_change_log_id_seq from public;
grant usage, select on sequence public.admin_change_log_id_seq to service_role;

do $policies$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_change_log'
      and policyname = 'authenticated_all_access_admin_change_log'
  ) then
    create policy authenticated_all_access_admin_change_log
      on public.admin_change_log
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_change_log'
      and policyname = 'service_role_all_admin_change_log'
  ) then
    create policy service_role_all_admin_change_log
      on public.admin_change_log
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$policies$;
