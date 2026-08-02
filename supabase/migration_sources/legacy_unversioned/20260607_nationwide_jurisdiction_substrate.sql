-- Integration-safe nationwide jurisdiction substrate.
-- This migration is additive: it does not create a competing canonical
-- jurisdiction table. Canonical jurisdiction identity remains a dynamic
-- (jurisdiction_ref_table, jurisdiction_ref_id) reference to existing runtime
-- tables or Atlas bridge projections documented in the ownership ADR.

create table if not exists jurisdiction_assertions (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_record_id text not null,
  source_name text,
  source_hash text,
  candidate_record_id text,
  canonical_record_id text,
  jurisdiction_ref_table text,
  jurisdiction_ref_id text,
  jurisdiction_type text not null,
  jurisdiction_label text,
  jurisdiction_code text,
  relationship_type text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_basis text not null,
  created_from_rule text not null,
  review_status text not null default 'queued',
  promotion_status text not null default 'queued',
  promotion_batch_id text,
  review_decision_by text,
  review_decision_at timestamptz,
  rejected_reason text,
  supersedes_id uuid references jurisdiction_assertions(id),
  is_active boolean not null default true,

  -- Tribal-specific metadata. Kept with assertions so tribal sovereignty is not
  -- flattened into state/federal records while canonical identity is resolved.
  tribal_nation text,
  federal_recognition_status text,
  source_authority text,
  tribal_government_name text,
  tribal_court_name text,
  reservation_or_service_area text,
  state_overlap text[] not null default '{}',
  federal_agency_overlap text[] not null default '{}',
  bia_overlap text[] not null default '{}',
  ihs_overlap text[] not null default '{}',
  bie_overlap text[] not null default '{}',
  icwa_relevance text,
  public_law_280_relevance text,
  treaty_reserved_rights_reference text,

  -- Rural/service-area growth hooks. Geometry is intentionally a reference so
  -- future Atlas/Civic Map geometry stores can own large shapes.
  county_fips text,
  census_geoid text,
  service_area_geometry_ref text,
  regional_service_area text,
  legal_aid_service_area text,
  tribal_service_area text,
  distance_travel_barrier_flags text[] not null default '{}',
  remote_phone_online_intake text[] not null default '{}',
  rural_frontier_classification text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jurisdiction_assertions_source on jurisdiction_assertions (source_table, source_record_id);
create index if not exists idx_jurisdiction_assertions_candidate on jurisdiction_assertions (candidate_record_id) where candidate_record_id is not null;
create index if not exists idx_jurisdiction_assertions_canonical on jurisdiction_assertions (canonical_record_id) where canonical_record_id is not null;
create index if not exists idx_jurisdiction_assertions_ref on jurisdiction_assertions (jurisdiction_ref_table, jurisdiction_ref_id);
create index if not exists idx_jurisdiction_assertions_type on jurisdiction_assertions (jurisdiction_type);
create index if not exists idx_jurisdiction_assertions_review on jurisdiction_assertions (review_status, promotion_status);
create index if not exists idx_jurisdiction_assertions_active on jurisdiction_assertions (is_active) where is_active;
create index if not exists idx_jurisdiction_assertions_tribal on jurisdiction_assertions (tribal_nation) where tribal_nation is not null;
create index if not exists idx_jurisdiction_assertions_county_fips on jurisdiction_assertions (county_fips) where county_fips is not null;
create index if not exists idx_jurisdiction_assertions_metadata on jurisdiction_assertions using gin (metadata);

create table if not exists jurisdiction_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_jurisdiction_ref_table text not null,
  canonical_jurisdiction_ref_id text not null,
  alias_type text not null,
  alias_value text not null,
  source_system text not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  valid_from date,
  valid_to date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_jurisdiction_aliases_active_unique
  on jurisdiction_aliases (canonical_jurisdiction_ref_table, canonical_jurisdiction_ref_id, alias_type, alias_value, source_system)
  where is_active;
create index if not exists idx_jurisdiction_aliases_lookup on jurisdiction_aliases (alias_type, alias_value, source_system);
create index if not exists idx_jurisdiction_aliases_canonical on jurisdiction_aliases (canonical_jurisdiction_ref_table, canonical_jurisdiction_ref_id);

create table if not exists jurisdiction_coverage_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  report_kind text not null,
  scope text not null,
  source_inventory_hash text not null,
  generated_at timestamptz not null default now(),
  generated_by text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_jurisdiction_coverage_runs_kind_scope on jurisdiction_coverage_runs (report_kind, scope);
create index if not exists idx_jurisdiction_coverage_runs_generated on jurisdiction_coverage_runs (generated_at desc);

create table if not exists jurisdiction_coverage_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references jurisdiction_coverage_runs(id),
  jurisdiction_ref_table text,
  jurisdiction_ref_id text,
  jurisdiction_type text not null,
  domain text,
  runtime_surface text,
  pipeline_context text,
  coverage_state text not null,
  expected_count integer not null default 0,
  staged_count integer not null default 0,
  candidate_count integer not null default 0,
  promoted_count integer not null default 0,
  verified_count integer not null default 0,
  gap_count integer not null default 0,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  freshness_status text,
  gap_reason text,
  next_action text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_jurisdiction_coverage_items_run on jurisdiction_coverage_items (run_id);
create index if not exists idx_jurisdiction_coverage_items_ref on jurisdiction_coverage_items (jurisdiction_ref_table, jurisdiction_ref_id);
create index if not exists idx_jurisdiction_coverage_items_state on jurisdiction_coverage_items (coverage_state);
create index if not exists idx_jurisdiction_coverage_items_surface on jurisdiction_coverage_items (runtime_surface);
create index if not exists idx_jurisdiction_coverage_items_domain on jurisdiction_coverage_items (domain);
create index if not exists idx_jurisdiction_coverage_items_pipeline on jurisdiction_coverage_items (pipeline_context);

create table if not exists jurisdiction_overlap_assertions (
  id uuid primary key default gen_random_uuid(),
  from_jurisdiction_ref_table text not null,
  from_jurisdiction_ref_id text not null,
  to_jurisdiction_ref_table text not null,
  to_jurisdiction_ref_id text not null,
  relationship_type text not null,
  legal_basis text,
  evidence_basis text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_status text not null default 'queued',
  is_active boolean not null default true,
  valid_from date,
  valid_to date,
  supersedes_id uuid references jurisdiction_overlap_assertions(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_jurisdiction_overlap_from on jurisdiction_overlap_assertions (from_jurisdiction_ref_table, from_jurisdiction_ref_id);
create index if not exists idx_jurisdiction_overlap_to on jurisdiction_overlap_assertions (to_jurisdiction_ref_table, to_jurisdiction_ref_id);
create index if not exists idx_jurisdiction_overlap_relation on jurisdiction_overlap_assertions (relationship_type);
create index if not exists idx_jurisdiction_overlap_review on jurisdiction_overlap_assertions (review_status);
create index if not exists idx_jurisdiction_overlap_active on jurisdiction_overlap_assertions (is_active) where is_active;

create table if not exists jurisdiction_metadata_gaps (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_record_id text not null,
  missing_field text not null,
  jurisdiction_hint text,
  gap_reason text not null,
  severity text not null,
  pipeline_context text,
  runtime_surface text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_jurisdiction_metadata_gaps_source on jurisdiction_metadata_gaps (source_table, source_record_id);
create index if not exists idx_jurisdiction_metadata_gaps_open on jurisdiction_metadata_gaps (severity, created_at) where resolved_at is null;
create index if not exists idx_jurisdiction_metadata_gaps_surface on jurisdiction_metadata_gaps (runtime_surface) where runtime_surface is not null;

create or replace view v_jurisdiction_assertion_queue as
select
  source_table,
  source_record_id,
  jurisdiction_type,
  review_status,
  promotion_status,
  count(*)::bigint as assertion_count,
  max(updated_at) as last_updated_at
from jurisdiction_assertions
where is_active
group by source_table, source_record_id, jurisdiction_type, review_status, promotion_status;

create or replace view v_current_jurisdiction_coverage_items as
select distinct on (jcr.report_kind, jcr.scope, jci.jurisdiction_ref_table, jci.jurisdiction_ref_id, jci.domain, jci.runtime_surface, jci.pipeline_context)
  jcr.run_key,
  jcr.report_kind,
  jcr.scope,
  jcr.generated_at,
  jci.*
from jurisdiction_coverage_runs jcr
join jurisdiction_coverage_items jci on jci.run_id = jcr.id
order by jcr.report_kind, jcr.scope, jci.jurisdiction_ref_table, jci.jurisdiction_ref_id, jci.domain, jci.runtime_surface, jci.pipeline_context, jcr.generated_at desc;
