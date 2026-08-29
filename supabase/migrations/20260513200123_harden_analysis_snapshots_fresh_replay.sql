begin;

alter table public.analysis_snapshots enable row level security;

revoke all on public.analysis_snapshots from anon, authenticated;
grant select on public.analysis_snapshots to authenticated;
grant all on public.analysis_snapshots to service_role;

drop policy if exists authenticated_all_access_analysis_snapshots
  on public.analysis_snapshots;
create policy authenticated_all_access_analysis_snapshots
  on public.analysis_snapshots
  for select
  to authenticated
  using (true);

drop policy if exists service_role_all_analysis_snapshots_c074aec2
  on public.analysis_snapshots;
create policy service_role_all_analysis_snapshots_c074aec2
  on public.analysis_snapshots
  for all
  to service_role
  using (true)
  with check (true);

commit;
