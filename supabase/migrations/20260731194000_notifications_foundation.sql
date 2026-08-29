begin;

-- Production's server-mediated notification table predated its checked-in
-- runtime-contract migration. Reconstruct the final relation so clean replay
-- has the sequence and base columns that the hardening migration expects.
create table if not exists public.notifications (
  id serial primary key,
  user_id integer not null,
  type varchar(255) not null,
  title varchar(255) not null,
  message text not null,
  metadata jsonb,
  link_url varchar(500),
  read_at bigint,
  created_at bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  constraint notifications_user_id_users_id_fk
    foreign key (user_id) references public.users(id) on delete cascade
);

alter table public.notifications enable row level security;

revoke all on table public.notifications from public, anon, authenticated;
revoke all on sequence public.notifications_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

commit;
