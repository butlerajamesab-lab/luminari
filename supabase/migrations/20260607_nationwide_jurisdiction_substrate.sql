-- Nationwide + tribal + local jurisdiction substrate.
-- The schema intentionally models overlapping authorities rather than forcing a
-- single federal/state jurisdiction on civic, legal, and resource records.

create table if not exists jurisdiction_entities (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text,
  jurisdiction_type text not null check (jurisdiction_type in (
    'federal',
    'state',
    'district_of_columbia',
    'territory',
    'tribal',
    'county',
    'municipal',
    'regional',
    'interstate',
    'federal_circuit',
    'administrative_region',
    'unknown',
    'mixed'
  )),
  jurisdiction_code text,
  country text not null default 'US',
  state text,
  state_code text,
  territory text,
  territory_code text,
  district_of_columbia boolean not null default false,
  tribal_nation text,
  federal_recognition_status text,
  tribal_government_name text,
  tribal_court_name text,
  reservation_or_service_area text,
  state_overlap text[] not null default '{}',
  federal_agency_overlap text[] not null default '{}',
  source_authority text,
  county text,
  county_fips text,
  city text,
  municipality text,
  municipal_code text,
  region text,
  federal_district text,
  federal_circuit text,
  court_level text,
  agency_level text,
  service_area text,
  coverage_area text,
  rural_urban_classification text,
  rural_access_flags text[] not null default '{}',
  source_jurisdiction_text text,
  jurisdiction_confidence numeric(5,4) check (jurisdiction_confidence is null or (jurisdiction_confidence >= 0 and jurisdiction_confidence <= 1)),
  jurisdiction_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_jurisdiction_entities_identity
  on jurisdiction_entities (jurisdiction_type, coalesce(jurisdiction_code, ''), coalesce(jurisdiction, ''), coalesce(county_fips, ''), coalesce(municipal_code, ''), coalesce(tribal_nation, ''));
create index if not exists idx_jurisdiction_entities_type on jurisdiction_entities (jurisdiction_type);
create index if not exists idx_jurisdiction_entities_state_code on jurisdiction_entities (state_code);
create index if not exists idx_jurisdiction_entities_county_fips on jurisdiction_entities (county_fips);
create index if not exists idx_jurisdiction_entities_rural_urban on jurisdiction_entities (rural_urban_classification);
create index if not exists idx_jurisdiction_entities_metadata on jurisdiction_entities using gin (metadata);

create table if not exists record_jurisdiction_metadata (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_record_id text not null,
  pipeline_context text not null check (pipeline_context in (
    'staged',
    'candidate',
    'canonical',
    'queue',
    'backlog',
    'review',
    'promotion_batch',
    'complete_export'
  )),
  domain text,
  runtime_surface text,
  primary_jurisdiction_id uuid references jurisdiction_entities(id) on delete set null,
  jurisdiction text,
  jurisdiction_type text check (jurisdiction_type in (
    'federal',
    'state',
    'district_of_columbia',
    'territory',
    'tribal',
    'county',
    'municipal',
    'regional',
    'interstate',
    'federal_circuit',
    'administrative_region',
    'unknown',
    'mixed'
  )),
  jurisdiction_code text,
  country text not null default 'US',
  state text,
  state_code text,
  territory text,
  territory_code text,
  district_of_columbia boolean not null default false,
  tribal_nation text,
  county text,
  county_fips text,
  city text,
  municipality text,
  region text,
  federal_district text,
  federal_circuit text,
  court_level text,
  agency_level text,
  service_area text,
  coverage_area text,
  rural_urban_classification text,
  source_jurisdiction_text text,
  jurisdiction_confidence numeric(5,4) check (jurisdiction_confidence is null or (jurisdiction_confidence >= 0 and jurisdiction_confidence <= 1)),
  jurisdiction_notes text,
  missing_jurisdiction_metadata boolean not null default false,
  complete_export_cursor text,
  promotion_batch_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_table, source_record_id, pipeline_context)
);

create index if not exists idx_record_jurisdiction_source on record_jurisdiction_metadata (source_table, source_record_id);
create index if not exists idx_record_jurisdiction_pipeline on record_jurisdiction_metadata (pipeline_context);
create index if not exists idx_record_jurisdiction_type on record_jurisdiction_metadata (jurisdiction_type);
create index if not exists idx_record_jurisdiction_domain on record_jurisdiction_metadata (domain);
create index if not exists idx_record_jurisdiction_surface on record_jurisdiction_metadata (runtime_surface);
create index if not exists idx_record_jurisdiction_missing on record_jurisdiction_metadata (missing_jurisdiction_metadata) where missing_jurisdiction_metadata;
create index if not exists idx_record_jurisdiction_metadata_gin on record_jurisdiction_metadata using gin (metadata);

create table if not exists jurisdiction_record_links (
  id uuid primary key default gen_random_uuid(),
  record_metadata_id uuid not null references record_jurisdiction_metadata(id) on delete cascade,
  jurisdiction_id uuid not null references jurisdiction_entities(id) on delete cascade,
  relation text not null check (relation in ('primary', 'overlap', 'administered_by', 'enforced_by', 'appeal_to', 'service_area')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source_authority text,
  notes text,
  created_at timestamptz not null default now(),
  unique (record_metadata_id, jurisdiction_id, relation)
);

create index if not exists idx_jurisdiction_record_links_record on jurisdiction_record_links (record_metadata_id);
create index if not exists idx_jurisdiction_record_links_jurisdiction on jurisdiction_record_links (jurisdiction_id);
create index if not exists idx_jurisdiction_record_links_relation on jurisdiction_record_links (relation);

create table if not exists jurisdiction_coverage_reports (
  id uuid primary key default gen_random_uuid(),
  report_kind text not null check (report_kind in (
    'federal_coverage_matrix',
    'fifty_state_coverage_matrix',
    'district_of_columbia_coverage_report',
    'territory_coverage_matrix',
    'tribal_jurisdiction_coverage_report',
    'county_coverage_matrix',
    'municipal_coverage_matrix',
    'rural_access_coverage_report',
    'urban_access_coverage_report',
    'regional_multi_jurisdiction_coverage_report',
    'domain_by_jurisdiction_coverage_matrix',
    'runtime_surface_by_jurisdiction_coverage_matrix',
    'pipeline_context_by_jurisdiction_coverage_matrix'
  )),
  jurisdiction_id uuid references jurisdiction_entities(id) on delete set null,
  jurisdiction_type text not null,
  jurisdiction_code text,
  jurisdiction_name text,
  domain text,
  runtime_surface text,
  pipeline_context text,
  coverage_state text not null check (coverage_state in (
    'covered',
    'partially_covered',
    'staged_not_promoted',
    'candidate_only',
    'known_gap',
    'source_missing',
    'unknown',
    'not_applicable',
    'needs_review'
  )),
  canonical_count integer not null default 0,
  staged_count integer not null default 0,
  candidate_count integer not null default 0,
  backlog_count integer not null default 0,
  known_gap_count integer not null default 0,
  notes text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_jurisdiction_coverage_kind on jurisdiction_coverage_reports (report_kind);
create index if not exists idx_jurisdiction_coverage_state on jurisdiction_coverage_reports (coverage_state);
create index if not exists idx_jurisdiction_coverage_type_code on jurisdiction_coverage_reports (jurisdiction_type, jurisdiction_code);
create index if not exists idx_jurisdiction_coverage_domain on jurisdiction_coverage_reports (domain);

create or replace view v_jurisdiction_metadata_gaps as
select
  source_table,
  pipeline_context,
  domain,
  runtime_surface,
  count(*)::bigint as record_count,
  count(*) filter (where missing_jurisdiction_metadata or jurisdiction_type is null or jurisdiction_type = 'unknown')::bigint as missing_or_unknown_count,
  count(*) filter (where jurisdiction_type = 'tribal')::bigint as tribal_count,
  count(*) filter (where jurisdiction_type = 'territory')::bigint as territory_count,
  count(*) filter (where jurisdiction_type = 'district_of_columbia')::bigint as dc_count,
  count(*) filter (where rural_urban_classification ilike '%rural%')::bigint as rural_count
from record_jurisdiction_metadata
group by source_table, pipeline_context, domain, runtime_surface;

create or replace view v_overlapping_jurisdiction_records as
select
  rjm.id as record_metadata_id,
  rjm.source_table,
  rjm.source_record_id,
  rjm.pipeline_context,
  count(jrl.id)::bigint as linked_jurisdiction_count,
  array_agg(distinct je.jurisdiction_type order by je.jurisdiction_type) as jurisdiction_types
from record_jurisdiction_metadata rjm
join jurisdiction_record_links jrl on jrl.record_metadata_id = rjm.id
join jurisdiction_entities je on je.id = jrl.jurisdiction_id
group by rjm.id, rjm.source_table, rjm.source_record_id, rjm.pipeline_context
having count(jrl.id) > 1;
