-- Reconstruct the three registry resource realms that existed in production
-- before the unified resource projection entered source control.  The tables
-- begin empty; no production identities or resource rows are synthesized.

create table if not exists public.nonprofit_registry (
  uuid text primary key,
  entity_type text,
  full_entity_name text,
  aliases jsonb,
  jurisdiction text,
  verification_status text,
  contact jsonb,
  domains jsonb,
  public_filing_portals jsonb,
  related_statutes jsonb,
  oversight_bodies jsonb,
  related_entities jsonb,
  eligibility_requirements jsonb,
  application_methods jsonb,
  provenance jsonb,
  created_at timestamptz default now(),
  contact_email_norm text,
  contact_phone_norm text,
  contact_website_norm text,
  contact_physical_address_norm text,
  contact_raw_json jsonb,
  constraint nonprofit_registry_contact_email_norm_chk
    check (contact_email_norm is null or contact_email_norm ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$') not valid,
  constraint nonprofit_registry_contact_website_norm_chk
    check (contact_website_norm is null or contact_website_norm ~* '^(https?://|www\.)') not valid
);

create table if not exists public.government_benefits_registry (
  uuid text primary key,
  entity_type text,
  full_entity_name text,
  aliases jsonb,
  jurisdiction text,
  administering_agency text,
  website text,
  contact_phone text,
  eligibility_requirements jsonb,
  application_methods jsonb,
  benefit_categories jsonb,
  related_statutes jsonb,
  provenance jsonb,
  created_at timestamptz default now()
);

create table if not exists public.legal_aid_organizations (
  id serial primary key,
  org_id text,
  organization text,
  org_type text,
  jurisdiction_code text,
  jurisdiction_name text,
  coverage text,
  phone text,
  website text,
  email text,
  languages_intake text,
  languages_documentation text,
  translation_services text,
  claim_types text,
  handles_admin_stage integer,
  handles_post_lawsuit integer,
  intake_method text,
  capacity_status text,
  current_waitlist_months double precision,
  capacity_last_updated text,
  last_verified text,
  verification_source text,
  notes text,
  success_rate_wage_theft double precision,
  success_rate_employment double precision,
  success_rate_housing double precision,
  success_rate_benefits double precision,
  immigrant_worker_support integer,
  indigenous_worker_support integer,
  agricultural_worker_support integer,
  migrant_worker_support integer,
  bilingual_documentation integer,
  rural_accessibility text,
  capacity_warning integer,
  federal_backup_recommended integer,
  specialties text,
  created_at timestamptz,
  updated_at timestamptz
);

alter table public.nonprofit_registry enable row level security;
alter table public.government_benefits_registry enable row level security;
alter table public.legal_aid_organizations enable row level security;

revoke all on public.nonprofit_registry,
  public.government_benefits_registry,
  public.legal_aid_organizations
  from public, anon, authenticated;
grant select, insert, update, delete on public.nonprofit_registry,
  public.government_benefits_registry,
  public.legal_aid_organizations
  to service_role;
grant usage, select on sequence public.legal_aid_organizations_id_seq to service_role;

drop policy if exists service_role_all_nonprofit_registry on public.nonprofit_registry;
create policy service_role_all_nonprofit_registry
  on public.nonprofit_registry for all to service_role
  using (true) with check (true);

drop policy if exists service_role_all_government_benefits_registry on public.government_benefits_registry;
create policy service_role_all_government_benefits_registry
  on public.government_benefits_registry for all to service_role
  using (true) with check (true);

drop policy if exists service_role_all_legal_aid_organizations on public.legal_aid_organizations;
create policy service_role_all_legal_aid_organizations
  on public.legal_aid_organizations for all to service_role
  using (true) with check (true);

comment on table public.nonprofit_registry is
  'Service-only canonical nonprofit resource realm reconstructed for executable migration replay.';
comment on table public.government_benefits_registry is
  'Service-only canonical government-benefit resource realm reconstructed for executable migration replay.';
comment on table public.legal_aid_organizations is
  'Service-only canonical legal-aid resource realm reconstructed for executable migration replay.';
