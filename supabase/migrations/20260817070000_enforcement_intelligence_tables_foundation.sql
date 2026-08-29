-- Reconstruct the four enforcement-intelligence relations that existed live
-- before their canonicalization migration entered source control.  They begin
-- empty and service-only; no enforcement authority or outcomes are invented.

create table if not exists public.agency_forms (
  id serial primary key,
  agency text,
  agency_short text,
  form_name text,
  form_number text,
  purpose text,
  required_fields text,
  supporting_documents text,
  submission_methods text,
  filing_deadline text,
  link text,
  pipeline_category text,
  added_by text,
  created_at bigint,
  updated_at bigint,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  source_as_of date
);

create table if not exists public.regulatory_guidance (
  id serial primary key,
  agency text,
  agency_short text,
  document_title text,
  issue_area text,
  authority_basis text,
  guidance_type text,
  key_rules text,
  publication_date text,
  citation text,
  document_link text,
  pipeline_category text,
  added_by text,
  created_at bigint,
  updated_at bigint,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  source_as_of date
);

create table if not exists public.enforcement_penalties (
  id serial primary key,
  agency text,
  agency_short text,
  violation_type text,
  statutory_max_penalty text,
  average_penalty text,
  typical_settlement_range text,
  additional_remedies text,
  notable_cases text,
  notes text,
  pipeline_category text,
  added_by text,
  created_at bigint,
  updated_at bigint,
  authority_citation text,
  source_url text,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  source_as_of date
);

create table if not exists public.enforcement_viability_rules (
  id serial primary key,
  claim_type text,
  jurisdiction text,
  pipeline_category text,
  agency text,
  agency_short text,
  minimum_intake_threshold text,
  deadline_dependency text,
  trigger_strength text,
  historical_actionability text,
  recommended_channel text,
  notes text,
  added_by text,
  created_at bigint,
  updated_at bigint,
  authority_citation text,
  source_url text,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  source_as_of date
);

alter table public.agency_forms enable row level security;
alter table public.regulatory_guidance enable row level security;
alter table public.enforcement_penalties enable row level security;
alter table public.enforcement_viability_rules enable row level security;

revoke all on public.agency_forms, public.regulatory_guidance,
  public.enforcement_penalties, public.enforcement_viability_rules
  from public, anon, authenticated;
grant select, insert, update, delete on public.agency_forms,
  public.regulatory_guidance, public.enforcement_penalties,
  public.enforcement_viability_rules to service_role;
grant usage, select on sequence public.agency_forms_id_seq,
  public.regulatory_guidance_id_seq, public.enforcement_penalties_id_seq,
  public.enforcement_viability_rules_id_seq to service_role;

drop policy if exists service_role_all_agency_forms on public.agency_forms;
create policy service_role_all_agency_forms on public.agency_forms
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_regulatory_guidance on public.regulatory_guidance;
create policy service_role_all_regulatory_guidance on public.regulatory_guidance
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_enforcement_penalties on public.enforcement_penalties;
create policy service_role_all_enforcement_penalties on public.enforcement_penalties
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_enforcement_viability_rules on public.enforcement_viability_rules;
create policy service_role_all_enforcement_viability_rules on public.enforcement_viability_rules
  for all to service_role using (true) with check (true);

comment on table public.agency_forms is
  'Service-only enforcement agency form catalog reconstructed for executable migration replay.';
comment on table public.regulatory_guidance is
  'Service-only regulatory guidance catalog reconstructed for executable migration replay.';
comment on table public.enforcement_penalties is
  'Service-only enforcement penalty catalog reconstructed for executable migration replay.';
comment on table public.enforcement_viability_rules is
  'Service-only enforcement viability catalog reconstructed for executable migration replay.';
