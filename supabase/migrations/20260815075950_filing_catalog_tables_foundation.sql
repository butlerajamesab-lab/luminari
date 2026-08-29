-- Reconstruct the three filing-template relations that existed in production
-- before the unified Lighthouse filing catalog was committed.  The fresh
-- ledger creates schema only and never invents template content.

create table if not exists public.filing_generator (
  id serial primary key,
  claim_type text,
  jurisdiction text,
  pipeline_category text,
  agency text,
  agency_short text,
  form_name text,
  form_number text,
  filing_link text,
  filing_deadline text,
  required_fields text,
  required_evidence text,
  recommended_attachments text,
  submission_methods text,
  expected_timeline text,
  intake_warnings text,
  priority_flags text,
  next_steps text,
  notes text,
  created_at bigint,
  updated_at bigint
);

create table if not exists public.filing_templates (
  id uuid primary key default gen_random_uuid(),
  template_id text,
  template_name text,
  template_type text,
  issuing_agency text,
  jurisdiction text,
  template_text text,
  metadata jsonb not null default '{}'::jsonb,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.paperwork_templates (
  id serial primary key,
  template_type text,
  title text,
  description text,
  template_body text,
  required_fields text,
  applicable_claim_types text,
  jurisdiction text,
  created_at bigint,
  updated_at bigint
);

alter table public.filing_generator enable row level security;
alter table public.filing_templates enable row level security;
alter table public.paperwork_templates enable row level security;

revoke all on public.filing_generator,
  public.filing_templates,
  public.paperwork_templates
  from public, anon, authenticated;
grant select, insert, update, delete on public.filing_generator,
  public.filing_templates,
  public.paperwork_templates
  to service_role;
grant usage, select on sequence public.filing_generator_id_seq,
  public.paperwork_templates_id_seq to service_role;

drop policy if exists service_role_all_filing_generator on public.filing_generator;
create policy service_role_all_filing_generator
  on public.filing_generator for all to service_role
  using (true) with check (true);

drop policy if exists service_role_all_filing_templates on public.filing_templates;
create policy service_role_all_filing_templates
  on public.filing_templates for all to service_role
  using (true) with check (true);

drop policy if exists service_role_all_paperwork_templates on public.paperwork_templates;
create policy service_role_all_paperwork_templates
  on public.paperwork_templates for all to service_role
  using (true) with check (true);

comment on table public.filing_generator is
  'Service-only Lighthouse filing generator templates reconstructed for executable migration replay.';
comment on table public.filing_templates is
  'Service-only canonical filing templates reconstructed for executable migration replay.';
comment on table public.paperwork_templates is
  'Service-only paperwork templates reconstructed for executable migration replay.';
