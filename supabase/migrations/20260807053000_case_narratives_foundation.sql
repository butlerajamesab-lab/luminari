begin;

-- Reconstruct the legacy server-owned case narrative relation before the
-- identity-bridge migration enforces its one-narrative-per-case contract.
create table if not exists public.case_narratives (
  id serial primary key,
  case_id integer not null,
  user_id integer not null,
  content text not null,
  source_map jsonb not null,
  timeline_item_count integer not null,
  snapshot_id integer,
  generated_at bigint
);

alter table public.case_narratives enable row level security;
revoke all on table public.case_narratives from public, anon, authenticated;
revoke all on sequence public.case_narratives_id_seq
  from public, anon, authenticated;
grant all on table public.case_narratives to service_role;
grant usage, select on sequence public.case_narratives_id_seq to service_role;

drop policy if exists service_role_all_case_narratives
  on public.case_narratives;
create policy service_role_all_case_narratives
  on public.case_narratives
  for all to service_role using (true) with check (true);

commit;
