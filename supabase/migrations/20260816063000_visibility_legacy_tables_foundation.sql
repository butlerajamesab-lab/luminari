-- Reconstruct live-only legacy visibility relations referenced by the civic
-- object inventory.  These tables begin empty and remain service-only; their
-- absence is represented as zero rows, never as fabricated coverage.

create table if not exists public.unified_resources (
  id integer,
  source_table text,
  source_id text,
  name text,
  description text,
  resource_type text,
  domain text,
  need_types text,
  urgency_level text,
  jurisdiction_id text,
  jurisdiction_type text,
  state_code text,
  phone text,
  website text,
  email text,
  address text,
  hard_eligibility text,
  soft_signals text,
  matching_pipeline_types text,
  last_verified_at bigint,
  is_active integer,
  match_explanation_template text,
  category text,
  agency text,
  eligibility_notes text,
  apply_notes text,
  created_at bigint,
  updated_at bigint,
  verification_status text,
  flagged_reason text,
  verified_by text
);

create table if not exists public.legal_case_law (
  id uuid primary key default gen_random_uuid(),
  citation text not null,
  case_name text,
  jurisdiction text not null,
  domains jsonb default '[]'::jsonb,
  year_decided text,
  court text,
  summary text,
  key_quotes jsonb default '[]'::jsonb,
  source_url text,
  verification_status text default 'verified',
  source_checked text,
  date_checked text,
  created_at timestamptz default now(),
  title text,
  opinion_text text,
  metadata jsonb default '{}'::jsonb
);

create table if not exists public.legal_enforcement_records (
  id serial primary key,
  jurisdiction text,
  agency_name text,
  complaint_type text,
  domains text,
  statutory_requirement text,
  statute_citation text,
  outcome text,
  required_response_days integer,
  observed_response_days text,
  pattern_description text,
  data_source text,
  period_start text,
  period_end text,
  added_by text,
  created_at bigint,
  updated_at bigint
);

create table if not exists public.civil_gideon_directory (
  id uuid primary key default gen_random_uuid(),
  directory_id text,
  resource_name text,
  jurisdiction text,
  resource_type text,
  service_area text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  source_url text,
  created_at timestamptz not null default now()
);

alter table public.unified_resources enable row level security;
alter table public.legal_case_law enable row level security;
alter table public.legal_enforcement_records enable row level security;
alter table public.civil_gideon_directory enable row level security;

revoke all on public.unified_resources,
  public.legal_case_law,
  public.legal_enforcement_records,
  public.civil_gideon_directory
  from public, anon, authenticated;
grant select, insert, update, delete on public.unified_resources,
  public.legal_case_law,
  public.legal_enforcement_records,
  public.civil_gideon_directory
  to service_role;
grant usage, select on sequence public.legal_enforcement_records_id_seq to service_role;

drop policy if exists service_role_all_unified_resources on public.unified_resources;
create policy service_role_all_unified_resources on public.unified_resources
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_legal_case_law on public.legal_case_law;
create policy service_role_all_legal_case_law on public.legal_case_law
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_legal_enforcement_records on public.legal_enforcement_records;
create policy service_role_all_legal_enforcement_records on public.legal_enforcement_records
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_civil_gideon_directory on public.civil_gideon_directory;
create policy service_role_all_civil_gideon_directory on public.civil_gideon_directory
  for all to service_role using (true) with check (true);

comment on table public.unified_resources is
  'Service-only legacy mixed resource relation reconstructed as an empty visibility lane.';
comment on table public.legal_case_law is
  'Service-only canonical case-law relation reconstructed for executable migration replay.';
comment on table public.legal_enforcement_records is
  'Service-only legal enforcement relation reconstructed for executable migration replay.';
comment on table public.civil_gideon_directory is
  'Service-only civil Gideon directory reconstructed for executable migration replay.';
