begin;

alter table public.locator_sources enable row level security;
alter table public.gov_offices enable row level security;
alter table public.resource_office_xwalk enable row level security;
alter table public.foia_agency_records enable row level security;
alter table public.foia_record_types enable row level security;

revoke all privileges on table
  public.locator_sources,
  public.gov_offices,
  public.resource_office_xwalk,
  public.foia_agency_records,
  public.foia_record_types
from public, anon, authenticated;

grant select on table
  public.locator_sources,
  public.gov_offices,
  public.resource_office_xwalk,
  public.foia_agency_records,
  public.foia_record_types
to anon, authenticated;

drop policy if exists locator_sources_public_read on public.locator_sources;
create policy locator_sources_public_read on public.locator_sources
  for select to anon, authenticated using (true);
drop policy if exists gov_offices_public_read on public.gov_offices;
create policy gov_offices_public_read on public.gov_offices
  for select to anon, authenticated using (true);
drop policy if exists resource_office_xwalk_public_read on public.resource_office_xwalk;
create policy resource_office_xwalk_public_read on public.resource_office_xwalk
  for select to anon, authenticated using (true);
drop policy if exists foia_agency_records_public_read on public.foia_agency_records;
create policy foia_agency_records_public_read on public.foia_agency_records
  for select to anon, authenticated using (true);
drop policy if exists foia_record_types_public_read on public.foia_record_types;
create policy foia_record_types_public_read on public.foia_record_types
  for select to anon, authenticated using (true);

alter table public.registry_raw_archive enable row level security;
drop policy if exists archive_read_only on public.registry_raw_archive;
drop policy if exists authenticated_all_access_registry_raw_archive on public.registry_raw_archive;
drop policy if exists registry_raw_archive_read on public.registry_raw_archive;
revoke all privileges on table public.registry_raw_archive
  from public, anon, authenticated;
revoke all privileges on sequence public.registry_raw_archive_id_seq
  from public, anon, authenticated;
grant select on table public.registry_raw_archive to anon, authenticated;
create policy registry_raw_archive_read on public.registry_raw_archive
  for select to anon, authenticated using (locked is true);

alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from public, anon, authenticated;

commit;
