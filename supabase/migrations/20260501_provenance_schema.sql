begin;

create extension if not exists pgcrypto;

create table if not exists api_source_registry (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_owner text,
  source_type text not null check (
    source_type in (
      'government_api',
      'public_dataset',
      'nonprofit_api',
      'court_api',
      'regulatory_api',
      'benefits_api',
      'civic_resource_api',
      'legal_source_api',
      'manual_source',
      'other'
    )
  ),
  base_url text not null,
  documentation_url text,
  jurisdiction_scope text,
  geographic_scope text,
  domain text not null,
  auth_type text not null check (
    auth_type in (
      'none',
      'api_key',
      'oauth',
      'bearer_token',
      'service_account',
      'manual'
    )
  ),
  requires_secret boolean not null default false,
  secret_name text,
  rate_limit_notes text,
  terms_url text,
  license text,
  freshness_expectation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_api_source_registry_domain
  on api_source_registry(domain);

create index if not exists idx_api_source_registry_scope
  on api_source_registry(jurisdiction_scope, geographic_scope);

create table if not exists api_pull_run (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references api_source_registry(id),
  run_key text not null unique,
  connector_version text not null,
  parser_version text not null,
  normalization_version text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (
    status in (
      'started',
      'success',
      'partial_success',
      'failed',
      'cancelled'
    )
  ),
  request_url text not null,
  request_method text not null default 'GET',
  request_params jsonb not null default '{}'::jsonb,
  request_headers_safe jsonb not null default '{}'::jsonb,
  response_status integer,
  response_content_type text,
  response_record_count integer,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_rejected integer not null default 0,
  source_snapshot_hash text,
  response_body_hash text,
  error_message text,
  notes text,
  created_at timestamptz not null default now(),
  constraint api_pull_run_no_secret_headers
    check (
      request_headers_safe::text !~* '(service_role|authorization|bearer|api[_-]?key|secret|token|password)'
    ),
  constraint api_pull_run_no_secret_params
    check (
      request_params::text !~* '(service_role|authorization|bearer|secret|password)'
    )
);

create index if not exists idx_api_pull_run_source_id
  on api_pull_run(source_id);

create index if not exists idx_api_pull_run_status
  on api_pull_run(status);

create index if not exists idx_api_pull_run_started_at
  on api_pull_run(started_at desc);

create table if not exists raw_api_record (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references api_source_registry(id),
  pull_run_id uuid not null references api_pull_run(id),
  external_record_id text,
  external_record_url text,
  source_table_or_endpoint text,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  raw_payload jsonb not null,
  raw_payload_hash text not null,
  record_fingerprint text not null,
  retrieved_at timestamptz not null default now(),
  retrieval_method text not null default 'api_pull',
  provenance_status text not null default 'raw_pulled' check (
    provenance_status in (
      'raw_pulled',
      'parsed',
      'normalized',
      'rejected',
      'superseded',
      'archived'
    )
  ),
  created_at timestamptz not null default now(),
  constraint raw_api_record_payload_hash_unique
    unique(raw_payload_hash),
  constraint raw_api_record_fingerprint_unique
    unique(record_fingerprint)
);

create unique index if not exists uq_raw_api_record_source_external
  on raw_api_record(source_id, external_record_id)
  where external_record_id is not null;

create index if not exists idx_raw_api_record_source_id
  on raw_api_record(source_id);

create index if not exists idx_raw_api_record_pull_run_id
  on raw_api_record(pull_run_id);

create index if not exists idx_raw_api_record_status
  on raw_api_record(provenance_status);

create table if not exists normalized_civic_resource (
  id uuid primary key default gen_random_uuid(),
  raw_record_id uuid not null references raw_api_record(id),
  source_id uuid not null references api_source_registry(id),
  pull_run_id uuid not null references api_pull_run(id),
  resource_type text not null,
  name text not null,
  description text,
  organization_name text,
  agency_name text,
  address_line1 text,
  address_line2 text,
  city text,
  county text,
  state text,
  postal_code text,
  country text not null default 'US',
  latitude numeric,
  longitude numeric,
  geocode_precision text check (
    geocode_precision in (
      'exact',
      'rooftop',
      'street',
      'zip',
      'city',
      'county',
      'state',
      'unmapped',
      'unknown'
    )
  ),
  phone text,
  email text,
  website_url text,
  service_categories text[] not null default '{}',
  eligibility_summary text,
  hours jsonb not null default '{}'::jsonb,
  languages text[] not null default '{}',
  accessibility_features text[] not null default '{}',
  normalized_payload jsonb not null default '{}'::jsonb,
  normalization_confidence numeric,
  normalization_notes text,
  source_snapshot_hash text,
  raw_payload_hash text not null,
  normalized_record_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint normalized_civic_resource_raw_unique
    unique(raw_record_id),
  constraint normalized_civic_resource_hash_unique
    unique(normalized_record_hash)
);

create index if not exists idx_normalized_resource_source_id
  on normalized_civic_resource(source_id);

create index if not exists idx_normalized_resource_pull_run_id
  on normalized_civic_resource(pull_run_id);

create index if not exists idx_normalized_resource_type
  on normalized_civic_resource(resource_type);

create index if not exists idx_normalized_resource_geo
  on normalized_civic_resource(state, county, city);

create index if not exists idx_normalized_resource_categories
  on normalized_civic_resource using gin(service_categories);

create table if not exists atlas_lighthouse_resource_bridge_v1 (
  id uuid primary key default gen_random_uuid(),
  atlas_resource_id uuid not null,
  lighthouse_resource_id uuid,
  raw_record_id uuid not null references raw_api_record(id),
  source_id uuid not null references api_source_registry(id),
  pull_run_id uuid not null references api_pull_run(id),
  bridge_version text not null default 'atlas_lighthouse_resource_bridge_v1',
  bridge_run_id uuid not null,
  bridged_at timestamptz not null default now(),
  source_project text not null default 'atlas',
  target_project text not null default 'lighthouse',
  source_table text not null,
  target_table text not null,
  source_record_hash text not null,
  target_record_hash text,
  bridge_record_hash text not null unique,
  projection_mode text not null check (
    projection_mode in (
      'insert',
      'update',
      'upsert',
      'read_only_projection'
    )
  ),
  bridge_status text not null check (
    bridge_status in (
      'pending',
      'projected',
      'failed',
      'skipped',
      'superseded'
    )
  ),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bridge_atlas_resource
  on atlas_lighthouse_resource_bridge_v1(atlas_resource_id);

create index if not exists idx_bridge_lighthouse_resource
  on atlas_lighthouse_resource_bridge_v1(lighthouse_resource_id);

create index if not exists idx_bridge_run
  on atlas_lighthouse_resource_bridge_v1(bridge_run_id);

create index if not exists idx_bridge_status
  on atlas_lighthouse_resource_bridge_v1(bridge_status);

create table if not exists atlas_lighthouse_signal_bridge_v1 (
  id uuid primary key default gen_random_uuid(),
  atlas_signal_id uuid not null,
  lighthouse_signal_id uuid,
  raw_record_id uuid references raw_api_record(id),
  normalized_resource_id uuid references normalized_civic_resource(id),
  resource_bridge_id uuid references atlas_lighthouse_resource_bridge_v1(id),
  source_id uuid not null references api_source_registry(id),
  pull_run_id uuid not null references api_pull_run(id),
  bridge_version text not null default 'atlas_lighthouse_signal_bridge_v1',
  bridge_run_id uuid not null,
  bridged_at timestamptz not null default now(),
  source_project text not null default 'atlas',
  target_project text not null default 'lighthouse',
  source_table text not null,
  target_table text not null,
  source_signal_hash text not null,
  target_signal_hash text,
  bridge_record_hash text not null unique,
  projection_mode text not null check (
    projection_mode in (
      'insert',
      'update',
      'upsert',
      'read_only_projection'
    )
  ),
  bridge_status text not null check (
    bridge_status in (
      'pending',
      'projected',
      'failed',
      'skipped',
      'superseded'
    )
  ),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_signal_bridge_atlas_signal
  on atlas_lighthouse_signal_bridge_v1(atlas_signal_id);

create index if not exists idx_signal_bridge_lighthouse_signal
  on atlas_lighthouse_signal_bridge_v1(lighthouse_signal_id);

create index if not exists idx_signal_bridge_resource_bridge
  on atlas_lighthouse_signal_bridge_v1(resource_bridge_id);

create index if not exists idx_signal_bridge_run
  on atlas_lighthouse_signal_bridge_v1(bridge_run_id);

create table if not exists detected_signals_v2 (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  signal_description text not null,
  severity text not null check (
    severity in (
      'low',
      'medium',
      'high',
      'critical'
    )
  ),
  confidence_score numeric,
  status text not null default 'detected' check (
    status in (
      'detected',
      'reviewed',
      'promoted',
      'dismissed',
      'superseded',
      'archived'
    )
  ),
  geography_type text check (
    geography_type in (
      'point',
      'city',
      'county',
      'state',
      'region',
      'national',
      'unknown'
    )
  ),
  city text,
  county text,
  state text,
  latitude numeric,
  longitude numeric,
  source_system text not null check (
    source_system in (
      'atlas',
      'lighthouse',
      'sunam',
      'manual_seed',
      'imported_script',
      'unknown'
    )
  ),
  origin_type text not null check (
    origin_type in (
      'atlas_bridged',
      'lighthouse_native',
      'manual_seed',
      'copied',
      'mixed',
      'unknown'
    )
  ),
  source_id uuid references api_source_registry(id),
  pull_run_id uuid references api_pull_run(id),
  raw_record_id uuid references raw_api_record(id),
  normalized_resource_id uuid references normalized_civic_resource(id),
  resource_bridge_id uuid references atlas_lighthouse_resource_bridge_v1(id),
  signal_bridge_id uuid references atlas_lighthouse_signal_bridge_v1(id),
  signal_rule_id text,
  signal_rule_version text,
  signal_generation_run_id uuid,
  source_snapshot_hash text,
  raw_payload_hash text,
  signal_fingerprint text not null,
  signal_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint detected_signals_v2_atlas_requires_signal_bridge
    check (
      origin_type <> 'atlas_bridged'
      or signal_bridge_id is not null
    )
);

create index if not exists idx_detected_signals_v2_type
  on detected_signals_v2(signal_type);

create index if not exists idx_detected_signals_v2_severity
  on detected_signals_v2(severity);

create index if not exists idx_detected_signals_v2_origin
  on detected_signals_v2(source_system, origin_type);

create index if not exists idx_detected_signals_v2_geo
  on detected_signals_v2(state, county, city);

create index if not exists idx_detected_signals_v2_created
  on detected_signals_v2(created_at desc);

create table if not exists signal_source_link (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null,
  signal_table text not null,
  raw_record_id uuid references raw_api_record(id),
  normalized_resource_id uuid references normalized_civic_resource(id),
  resource_bridge_id uuid references atlas_lighthouse_resource_bridge_v1(id),
  signal_bridge_id uuid references atlas_lighthouse_signal_bridge_v1(id),
  source_id uuid not null references api_source_registry(id),
  pull_run_id uuid references api_pull_run(id),
  signal_generation_run_id uuid,
  signal_rule_id text not null,
  signal_rule_version text not null,
  source_system text not null check (
    source_system in (
      'atlas',
      'lighthouse',
      'sunam',
      'manual_seed',
      'imported_script',
      'unknown'
    )
  ),
  origin_type text not null check (
    origin_type in (
      'atlas_bridged',
      'lighthouse_native',
      'manual_seed',
      'copied',
      'mixed',
      'unknown'
    )
  ),
  evidence_basis text not null check (
    evidence_basis in (
      'direct_row_provenance',
      'bridge_table_match',
      'shared_source_match_only',
      'manual_seed_script',
      'generated_by_lighthouse_pipeline_no_atlas_bridge',
      'inferred_unproven',
      'unknown'
    )
  ),
  confidence_score numeric,
  created_at timestamptz not null default now(),
  constraint signal_source_link_atlas_requires_bridge
    check (
      origin_type <> 'atlas_bridged'
      or signal_bridge_id is not null
    )
);

create index if not exists idx_signal_source_link_signal
  on signal_source_link(signal_table, signal_id);

create index if not exists idx_signal_source_link_origin
  on signal_source_link(source_system, origin_type);

create index if not exists idx_signal_source_link_source
  on signal_source_link(source_id);

create index if not exists idx_signal_source_link_raw
  on signal_source_link(raw_record_id);

create or replace view v_unproven_atlas_signal_claims as
select
  ds.id,
  ds.signal_type,
  ds.signal_description,
  ds.source_system,
  ds.origin_type,
  ds.signal_bridge_id,
  ds.created_at
from detected_signals_v2 ds
where ds.origin_type = 'atlas_bridged'
  and ds.signal_bridge_id is null;

create or replace view v_lighthouse_native_signals as
select
  ds.id,
  ds.signal_type,
  ds.signal_description,
  ds.severity,
  ds.confidence_score,
  ds.source_system,
  ds.origin_type,
  ds.created_at
from detected_signals_v2 ds
where ds.origin_type = 'lighthouse_native';

create or replace view v_api_pull_provenance_summary as
select
  s.source_key,
  s.source_name,
  s.domain,
  r.id as pull_run_id,
  r.run_key,
  r.status,
  r.started_at,
  r.finished_at,
  r.response_record_count,
  r.records_inserted,
  r.records_updated,
  r.records_rejected
from api_pull_run r
join api_source_registry s on s.id = r.source_id
order by r.started_at desc;

commit;