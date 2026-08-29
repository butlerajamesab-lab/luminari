begin;

-- The workspace contract migration evolved an existing production table whose
-- creation was absent from source control. Restore only its pre-evolution base
-- columns here; the following migration adds expiry and permission controls.
create table if not exists public.share_links (
  id serial primary key,
  case_id integer not null,
  created_by integer not null,
  token varchar(255)
);

alter table public.share_links enable row level security;
revoke all on table public.share_links from public, anon, authenticated;
revoke all on sequence public.share_links_id_seq from public, anon, authenticated;
grant all on table public.share_links to service_role;
grant usage, select on sequence public.share_links_id_seq to service_role;

drop policy if exists service_role_all_share_links on public.share_links;
create policy service_role_all_share_links
  on public.share_links
  for all
  to service_role
  using (true)
  with check (true);

commit;
