begin;

create table if not exists public.luminari_resource_entities (
  resource_entity_id uuid primary key default gen_random_uuid(),
  canonical_id text unique,
  source_family_key text references public.luminari_document_family_contracts(family_key),
  source_table text,
  source_pk text,
  source_hash text,
  resource_name text not null,
  resource_type text,
  resource_category text,
  layer text,
  jurisdiction text,
  jurisdiction_scope text,
  state text,
  county text,
  city text,
  description text,
  eligibility_summary text,
  apply_notes text,
  service_categories text[] default '{}',
  domains jsonb default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified',
  promotion_status text not null default 'candidate',
  provenance_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.luminari_resource_contact_points (
  contact_point_id uuid primary key default gen_random_uuid(),
  resource_entity_id uuid references public.luminari_resource_entities(resource_entity_id) on delete cascade,
  canonical_id text,
  contact_type text not null,
  contact_value text not null,
  label text,
  is_primary boolean not null default false,
  contact_quality text not null default 'unverified',
  source_table text,
  source_pk text,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_resource_locations (
  location_id uuid primary key default gen_random_uuid(),
  resource_entity_id uuid references public.luminari_resource_entities(resource_entity_id) on delete cascade,
  address_line1 text,
  address_line2 text,
  city text,
  county text,
  state text,
  postal_code text,
  country text default 'US',
  latitude numeric,
  longitude numeric,
  coordinate_quality text not null default 'unknown',
  geocode_source text,
  source_table text,
  source_pk text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_legal_authorities (
  legal_authority_id uuid primary key default gen_random_uuid(),
  canonical_id text unique,
  authority_type text not null,
  citation text,
  title text,
  jurisdiction text,
  jurisdiction_scope text,
  domains jsonb default '[]'::jsonb,
  summary text,
  authority_text text,
  effective_date text,
  last_amended text,
  source_url text,
  enforcement_agency text,
  statute_of_limitations text,
  verification_status text not null default 'unverified',
  source_table text,
  source_pk text,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.luminari_enforcement_channels (
  enforcement_channel_id uuid primary key default gen_random_uuid(),
  canonical_id text unique,
  agency_name text not null,
  jurisdiction text,
  domains jsonb default '[]'::jsonb,
  statutory_authority text,
  complaint_url text,
  phone text,
  filing_deadline text,
  process_summary text,
  response_timeline text,
  escalation_next text,
  source_table text,
  source_pk text,
  source_hash text,
  verification_status text not null default 'unverified',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_luminari_resource_entities_source on public.luminari_resource_entities(source_table, source_pk);
create index if not exists idx_luminari_resource_entities_jurisdiction on public.luminari_resource_entities(jurisdiction, state, city);
create index if not exists idx_luminari_resource_contact_points_entity on public.luminari_resource_contact_points(resource_entity_id, contact_type);
create index if not exists idx_luminari_resource_locations_entity on public.luminari_resource_locations(resource_entity_id);
create index if not exists idx_luminari_legal_authorities_citation on public.luminari_legal_authorities(citation);
create index if not exists idx_luminari_legal_authorities_jurisdiction on public.luminari_legal_authorities(jurisdiction, authority_type);
create index if not exists idx_luminari_enforcement_channels_agency on public.luminari_enforcement_channels(agency_name, jurisdiction);

-- The canonical targets are ledger-owned. Their source-profile views are
-- compatibility overlays over legacy tables that were not. Publish a profile
-- only when every referenced source column exists; do not invent source data.
do $compatibility$
declare
  missing_resource_prerequisites integer;
  missing_legal_prerequisites integer;
  candidate_kind "char";
  profile_kind "char";
begin
  select count(*)
    into missing_resource_prerequisites
  from (values
    ('registry_programs', 'id'),
    ('registry_programs', 'name_rp'),
    ('registry_programs', 'category_rp'),
    ('registry_programs', 'jurisdiction_id_rp'),
    ('registry_programs', 'eligibility_rp'),
    ('registry_programs', 'apply_notes_rp'),
    ('registry_programs', 'contact_rp'),
    ('registry_programs', 'website_rp'),
    ('registry_programs', 'fingerprint_rp'),
    ('government_benefits_registry', 'uuid'),
    ('government_benefits_registry', 'full_entity_name'),
    ('government_benefits_registry', 'entity_type'),
    ('government_benefits_registry', 'jurisdiction'),
    ('government_benefits_registry', 'eligibility_requirements'),
    ('government_benefits_registry', 'application_methods'),
    ('government_benefits_registry', 'contact_phone'),
    ('government_benefits_registry', 'website'),
    ('government_benefits_registry', 'provenance'),
    ('nonprofit_registry', 'uuid'),
    ('nonprofit_registry', 'full_entity_name'),
    ('nonprofit_registry', 'entity_type'),
    ('nonprofit_registry', 'jurisdiction'),
    ('nonprofit_registry', 'eligibility_requirements'),
    ('nonprofit_registry', 'application_methods'),
    ('nonprofit_registry', 'contact'),
    ('nonprofit_registry', 'provenance'),
    ('national_resources', 'id'),
    ('national_resources', 'resource_name'),
    ('national_resources', 'resource_type'),
    ('national_resources', 'jurisdiction'),
    ('national_resources', 'source_url'),
    ('national_resources', 'phone'),
    ('national_resources', 'website'),
    ('national_resources', 'metadata'),
    ('normalized_civic_resource', 'id'),
    ('normalized_civic_resource', 'name'),
    ('normalized_civic_resource', 'resource_type'),
    ('normalized_civic_resource', 'state'),
    ('normalized_civic_resource', 'city'),
    ('normalized_civic_resource', 'eligibility_summary'),
    ('normalized_civic_resource', 'normalization_notes'),
    ('normalized_civic_resource', 'phone'),
    ('normalized_civic_resource', 'email'),
    ('normalized_civic_resource', 'website_url'),
    ('normalized_civic_resource', 'address_line1'),
    ('normalized_civic_resource', 'normalized_record_hash')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  select c.relkind
    into candidate_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_luminari_resource_source_candidates';

  select c.relkind
    into profile_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_luminari_resource_source_profile';

  if missing_resource_prerequisites = 0
     and (candidate_kind is null or candidate_kind = 'v')
     and (profile_kind is null or profile_kind = 'v') then
    execute $view$
      create or replace view public.v_luminari_resource_source_candidates as
      select 'registry_programs'::text as source_table, id::text as source_pk,
        name_rp::text as resource_name, category_rp::text as resource_type,
        jurisdiction_id_rp::text as jurisdiction, null::text as state,
        null::text as city, eligibility_rp::text as eligibility_summary,
        apply_notes_rp::text as apply_notes, contact_rp::text as phone,
        null::text as email, website_rp::text as website_url,
        null::text as address_line1, fingerprint_rp::text as source_hash
      from public.registry_programs
      union all
      select 'government_benefits_registry', uuid::text, full_entity_name::text,
        entity_type::text, jurisdiction::text, null::text, null::text,
        eligibility_requirements::text, application_methods::text,
        contact_phone::text, null::text, website::text, null::text,
        provenance::text
      from public.government_benefits_registry
      union all
      select 'nonprofit_registry', uuid::text, full_entity_name::text,
        entity_type::text, jurisdiction::text, null::text, null::text,
        eligibility_requirements::text, application_methods::text,
        contact ->> 'phone', contact ->> 'email', contact ->> 'website',
        null::text, provenance::text
      from public.nonprofit_registry
      union all
      select 'national_resources', id::text, resource_name::text,
        resource_type::text, jurisdiction::text, null::text, null::text,
        null::text, source_url::text, phone::text, null::text, website::text,
        null::text, metadata::text
      from public.national_resources
      union all
      select 'normalized_civic_resource', id::text, name::text,
        resource_type::text, state::text, state::text, city::text,
        eligibility_summary::text, normalization_notes::text, phone::text,
        email::text, website_url::text, address_line1::text,
        normalized_record_hash::text
      from public.normalized_civic_resource
    $view$;

    execute $view$
      create or replace view public.v_luminari_resource_source_profile as
      select source_table, count(*) as total_rows,
        count(*) filter (where nullif(resource_name,'') is not null) as named_rows,
        count(*) filter (where nullif(phone,'') is not null) as phone_rows,
        count(*) filter (where nullif(email,'') is not null) as email_rows,
        count(*) filter (where nullif(website_url,'') is not null) as website_rows,
        count(*) filter (where nullif(address_line1,'') is not null) as address_rows,
        count(*) filter (where nullif(eligibility_summary,'') is not null) as eligibility_rows,
        count(*) filter (where nullif(apply_notes,'') is not null) as apply_note_rows
      from public.v_luminari_resource_source_candidates
      group by source_table
      order by source_table
    $view$;
  end if;

  select count(*)
    into missing_legal_prerequisites
  from (values
    ('legal_statutes', 'id'), ('legal_statutes', 'citation'),
    ('legal_statutes', 'short_title'), ('legal_statutes', 'title'),
    ('legal_statutes', 'jurisdiction'), ('legal_statutes', 'domains'),
    ('legal_statutes', 'summary'), ('legal_statutes', 'verbatim_key_text'),
    ('legal_statutes', 'statute_text'), ('legal_statutes', 'source_url'),
    ('legal_statutes', 'enforcement_agency'),
    ('legal_statutes', 'statute_of_limitations'),
    ('legal_statutes', 'verification_status'), ('legal_statutes', 'metadata'),
    ('legal_case_law', 'id'), ('legal_case_law', 'citation'),
    ('legal_case_law', 'case_name'), ('legal_case_law', 'title'),
    ('legal_case_law', 'jurisdiction'), ('legal_case_law', 'domains'),
    ('legal_case_law', 'summary'), ('legal_case_law', 'opinion_text'),
    ('legal_case_law', 'source_url'), ('legal_case_law', 'verification_status'),
    ('legal_case_law', 'metadata'),
    ('legal_enforcement', 'id'), ('legal_enforcement', 'statutory_authority'),
    ('legal_enforcement', 'agency_name'), ('legal_enforcement', 'jurisdiction'),
    ('legal_enforcement', 'domains'), ('legal_enforcement', 'process_summary'),
    ('legal_enforcement', 'complaint_url'), ('legal_enforcement', 'filing_deadline'),
    ('legal_enforcement', 'verification_status'),
    ('legal_enforcement_records', 'id'),
    ('legal_enforcement_records', 'statute_citation'),
    ('legal_enforcement_records', 'agency_name'),
    ('legal_enforcement_records', 'jurisdiction'),
    ('legal_enforcement_records', 'domains'),
    ('legal_enforcement_records', 'complaint_type'),
    ('legal_enforcement_records', 'statutory_requirement'),
    ('legal_enforcement_records', 'data_source'),
    ('legal_workflow_deadlines', 'id'),
    ('legal_workflow_deadlines', 'deadline_source_citation'),
    ('legal_workflow_deadlines', 'claim_type'),
    ('legal_workflow_deadlines', 'jurisdiction'),
    ('legal_workflow_deadlines', 'deadline_description'),
    ('legal_workflow_deadlines', 'source_url'),
    ('legal_workflow_deadlines', 'filing_body'),
    ('legal_workflow_deadlines', 'deadline_days'),
    ('legal_workflow_deadlines', 'verification_status')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  select c.relkind
    into candidate_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_luminari_legal_source_candidates';

  select c.relkind
    into profile_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'v_luminari_legal_source_profile';

  if missing_legal_prerequisites = 0
     and (candidate_kind is null or candidate_kind = 'v')
     and (profile_kind is null or profile_kind = 'v') then
    execute $view$
      create or replace view public.v_luminari_legal_source_candidates as
      select 'legal_statutes'::text as source_table, id::text as source_pk,
        'statute'::text as authority_type, citation::text,
        coalesce(short_title, title)::text as title, jurisdiction::text,
        domains, summary::text, coalesce(verbatim_key_text, statute_text)::text as authority_text,
        source_url::text, enforcement_agency::text,
        statute_of_limitations::text, verification_status::text,
        metadata::text as source_hash
      from public.legal_statutes
      union all
      select 'legal_case_law', id::text, 'case_law', citation::text,
        coalesce(case_name, title)::text, jurisdiction::text, domains,
        summary::text, opinion_text::text, source_url::text, null::text,
        null::text, verification_status::text, metadata::text
      from public.legal_case_law
      union all
      select 'legal_enforcement', id::text, 'enforcement_channel',
        statutory_authority::text, agency_name::text, jurisdiction::text,
        domains, process_summary::text, statutory_authority::text,
        complaint_url::text, agency_name::text, filing_deadline::text,
        verification_status::text, null::text
      from public.legal_enforcement
      union all
      select 'legal_enforcement_records', id::text, 'enforcement_record',
        statute_citation::text, agency_name::text, jurisdiction::text,
        to_jsonb(domains), complaint_type::text, statutory_requirement::text,
        data_source::text, agency_name::text, statutory_requirement::text,
        null::text, null::text
      from public.legal_enforcement_records
      union all
      select 'legal_workflow_deadlines', id::text, 'deadline_rule',
        deadline_source_citation::text, claim_type::text, jurisdiction::text,
        '[]'::jsonb, deadline_description::text, deadline_description::text,
        source_url::text, filing_body::text, deadline_days::text,
        verification_status::text, null::text
      from public.legal_workflow_deadlines
    $view$;

    execute $view$
      create or replace view public.v_luminari_legal_source_profile as
      select source_table, authority_type, count(*) as total_rows,
        count(*) filter (where nullif(citation,'') is not null) as citation_rows,
        count(*) filter (where nullif(title,'') is not null) as title_rows,
        count(*) filter (where nullif(jurisdiction,'') is not null) as jurisdiction_rows,
        count(*) filter (where nullif(source_url,'') is not null) as source_url_rows,
        count(*) filter (where nullif(statute_of_limitations,'') is not null) as sol_rows
      from public.v_luminari_legal_source_candidates
      group by source_table, authority_type
      order by source_table, authority_type
    $view$;
  end if;
end
$compatibility$;

update public.luminari_table_classification
set canonical_target = 'luminari_resource_entities + luminari_resource_contact_points + luminari_resource_locations',
    notes = coalesce(notes || ' | ', '') || 'Canonical resource target tables created; data migration pending validation.'
where merge_group = 'resource_registry_cluster';

update public.luminari_table_classification
set canonical_target = 'luminari_legal_authorities + luminari_enforcement_channels',
    notes = coalesce(notes || ' | ', '') || 'Canonical legal target tables created; data migration pending validation.'
where merge_group = 'legal_library_cluster';

commit;
