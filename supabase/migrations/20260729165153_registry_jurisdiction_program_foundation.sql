-- Restore the public registry lookup tables consumed by the state-directory
-- promotion. They are intentionally read-only to clients and writable only by
-- the service role.

create table if not exists public.registry_jurisdictions (
  id text primary key,
  name text,
  abbreviation text,
  fips text,
  type_rj text,
  population_rj text,
  medicaid_status text,
  minimum_wage text,
  ui_max text,
  wage_sol text,
  civil_rights_sol text,
  created_at_rj bigint
);

create table if not exists public.registry_programs (
  id text primary key,
  jurisdiction_id text,
  category text,
  name text,
  agency text,
  eligibility text,
  contact text,
  website text,
  apply_notes text,
  fingerprint text,
  created_at bigint,
  contact_raw_text text,
  contact_email_norm text,
  contact_phone_norm text,
  contact_website_norm text,
  jurisdiction_id_rp text generated always as (jurisdiction_id) stored,
  constraint registry_programs_contact_email_norm_chk
    check (
      contact_email_norm is null
      or contact_email_norm ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    ) not valid,
  constraint registry_programs_contact_website_norm_chk
    check (
      contact_website_norm is null
      or contact_website_norm ~* '^(https?://|www\.)'
    ) not valid
);

create index if not exists idx_registry_programs_jurisdiction_id_rp
  on public.registry_programs (jurisdiction_id);
create index if not exists idx_registry_programs_name
  on public.registry_programs
  using gin (to_tsvector('simple', coalesce(name, '')));

alter table public.registry_jurisdictions enable row level security;
alter table public.registry_programs enable row level security;

create policy public_read_registry_jurisdictions
  on public.registry_jurisdictions for select to anon, authenticated using (true);
create policy public_read_registry_programs
  on public.registry_programs for select to anon, authenticated using (true);

revoke all on table public.registry_jurisdictions, public.registry_programs
  from public, anon, authenticated;
grant select on table public.registry_jurisdictions, public.registry_programs
  to anon, authenticated;
grant all on table public.registry_jurisdictions, public.registry_programs
  to service_role;
