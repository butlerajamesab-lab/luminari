-- Restore the Lighthouse notification substrate to the snake_case PostgreSQL
-- contract used by the runtime compatibility router.
--
-- Security boundary: notifications remain server-mediated. Anonymous and
-- ordinary authenticated PostgREST roles receive no direct table privileges;
-- user ownership is enforced by protected tRPC procedures and parameterized
-- SQL. Existing rows are preserved and deterministically backfilled.

begin;

alter table public.notifications
  add column if not exists title varchar(255),
  add column if not exists message text,
  add column if not exists metadata jsonb,
  add column if not exists link_url varchar(500),
  add column if not exists read_at bigint,
  add column if not exists created_at bigint;

update public.notifications
set
  type = coalesce(nullif(btrim(type), ''), 'system'),
  title = coalesce(nullif(btrim(title), ''), 'Notification'),
  message = coalesce(nullif(btrim(message), ''), 'Notification'),
  created_at = coalesce(
    created_at,
    (extract(epoch from clock_timestamp()) * 1000)::bigint
  )
where
  type is null or btrim(type) = ''
  or title is null or btrim(title) = ''
  or message is null or btrim(message) = ''
  or created_at is null;

alter table public.notifications
  alter column type set not null,
  alter column title set not null,
  alter column message set not null,
  alter column created_at set default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  alter column created_at set not null;

alter table public.notifications enable row level security;

drop policy if exists authenticated_all_access_notifications
  on public.notifications;
drop policy if exists notifications_authenticated_all
  on public.notifications;
drop policy if exists notifications_owner_select
  on public.notifications;
drop policy if exists notifications_owner_insert
  on public.notifications;
drop policy if exists notifications_owner_update
  on public.notifications;
drop policy if exists notifications_owner_delete
  on public.notifications;

revoke all on table public.notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, read_at, created_at desc);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

do $foreign_key$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'f'
      and conname = 'notifications_user_id_users_id_fk'
  ) then
    alter table public.notifications
      add constraint notifications_user_id_users_id_fk
      foreign key (user_id)
      references public.users(id)
      on delete cascade;
  end if;
end
$foreign_key$;

commit;
