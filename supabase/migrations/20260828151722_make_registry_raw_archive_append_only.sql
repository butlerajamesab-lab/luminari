begin;

create or replace function private.reject_registry_raw_archive_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'registry_raw_archive_is_append_only';
end;
$$;

revoke all privileges on function private.reject_registry_raw_archive_mutation()
  from public, anon, authenticated;

drop trigger if exists registry_raw_archive_reject_locked_mutation
  on public.registry_raw_archive;
create trigger registry_raw_archive_reject_locked_mutation
  before update or delete on public.registry_raw_archive
  for each row execute function private.reject_registry_raw_archive_mutation();

drop trigger if exists registry_raw_archive_reject_truncate
  on public.registry_raw_archive;
create trigger registry_raw_archive_reject_truncate
  before truncate on public.registry_raw_archive
  for each statement execute function private.reject_registry_raw_archive_mutation();

commit;
