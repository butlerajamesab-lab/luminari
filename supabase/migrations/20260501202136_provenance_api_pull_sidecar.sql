create extension if not exists pgcrypto;

create or replace function set_updated_at_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists api_source_registry (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_owner text,
  source_type text not null check (source_type in ('government_api','public_dataset','nonprofit_api','court_api','regulatory_api','benefits_api','civic_resource_api','legal_source_api','manual_source','other')),
  base_url text not null,
  documentation_url text,
  jurisdiction_scope text,
  geographic_scope text,
  domain text not null,
  auth_type text check (auth_type in ('none','api_key','oauth','bearer_token','service_account','manual')),
  requires_secret boolean default false,
  secret_name text,
  rate_limit_notes text,
  terms_url text,
  license text,
  freshness_expectation text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_api_source_registry_domain on api_source_registry(domain);
create index if not exists idx_api_source_registry_scopes on api_source_registry(jurisdiction_scope, geographic_scope);
drop trigger if exists trg_api_source_registry_updated on api_source_registry;
create trigger trg_api_source_registry_updated before update on api_source_registry for each row execute function set_updated_at_timestamp();

create table if not exists api_pull_run (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references api_source_registry(id),
  run_key text not null unique,
  connector_version text not null,
  parser_version text not null,
  normalization_version text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text check (status in ('started','success','partial_success','failed','cancelled')),
  request_url text not null,
  request_method text default 'GET',
  request_params jsonb default '{}'::jsonb,
  request_headers_safe jsonb default '{}'::jsonb,
  response_status integer,
  response_content_type text,
  response_record_count integer,
  records_inserted integer default 0,
  records_updated integer default 0,
  records_rejected integer default 0,
  source_snapshot_hash text,
  response_body_hash text,
  error_message text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists idx_api_pull_run_source on api_pull_run(source_id);
create index if not exists idx_api_pull_run_status on api_pull_run(status);
create index if not exists idx_api_pull_run_started on api_pull_run(started_at desc);

create or replace function api_pull_run_security_check()
returns trigger as $$
declare
  forbidden text[] := array['service_role','authorization','bearer','api key','api_key','secret','token','password'];
  key text;
begin
  if new.request_params is not null then
    for key in select jsonb_object_keys(new.request_params) loop
      if lower(key) = any(forbidden) then
        raise exception 'Security violation: forbidden key "%" in request_params for run_key=%', key, new.run_key;
      end if;
    end loop;
  end if;
  if new.request_headers_safe is not null then
    for key in select jsonb_object_keys(new.request_headers_safe) loop
      if lower(key) = any(forbidden) then
        raise exception 'Security violation: forbidden key "%" in request_headers_safe for run_key=%', key, new.run_key;
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;
drop trigger if exists trg_api_pull_run_security on api_pull_run;
create trigger trg_api_pull_run_security before insert or update of request_params, request_headers_safe on api_pull_run for each row execute function api_pull_run_security_check();

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
  raw_payload_hash text not null unique,
  record_fingerprint text not null unique,
  retrieved_at timestamptz default now(),
  retrieval_method text default 'api_pull',
  provenance_status text default 'raw_pulled' check (provenance_status in ('raw_pulled','parsed','normalized','rejected','superseded','archived')),
  created_at timestamptz default now()
);
create unique index if not exists idx_raw_api_record_source_external on raw_api_record(source_id, external_record_id) where external_record_id is not null;
create index if not exists idx_raw_api_record_source on raw_api_record(source_id);
create index if not exists idx_raw_api_record_pull_run on raw_api_record(pull_run_id);
create index if not exists idx_raw_api_record_status on raw_api_record(provenance_status);

create table if not exists normalized_civic_resource (
  id uuid primary key default gen_random_uuid(),
  raw_record_id uuid unique references raw_api_record(id),
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
  country text default 'US',
  latitude numeric,
  longitude numeric,
  geocode_precision text check (geocode_precision in ('exact','rooftop','street','zip','city','county','state','unmapped','unknown')),
  phone text,
  email text,
  website_url text,
  service_categories text[] default '{}',
  eligibility_summary text,
  hours jsonb default '{}'::jsonb,
  languages text[] default '{}',
  accessibility_features text[] default '{}',
  normalized_payload jsonb default '{}'::jsonb,
  normalization_confidence numeric,
  normalization_notes text,
  source_snapshot_hash text,
  raw_payload_hash text not null,
  normalized_record_hash text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_norm_resource_source on normalized_civic_resource(source_id);
create index if not exists idx_norm_resource_pull_run on normalized_civic_resource(pull_run_id);
create index if not exists idx_norm_resource_type on normalized_civic_resource(resource_type);
create index if not exists idx_norm_resource_geo on normalized_civic_resource(state, county, city);
create index if not exists idx_norm_resource_services on normalized_civic_resource using gin(service_categories);
drop trigger if exists trg_norm_resource_updated on normalized_civic_resource;
create trigger trg_norm_resource_updated before update on normalized_civic_resource for each row execute function set_updated_at_timestamp();

create table if not exists detected_signals_v2 (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  signal_description text not null,
  severity text check (severity in ('low','medium','high','critical')),
  confidence_score numeric,
  status text default 'detected' check (status in ('detected','reviewed','promoted','dismissed','superseded','archived')),
  geography_type text check (geography_type in ('point','city','county','state','region','national','unknown')),
  city text,
  county text,
  state text,
  latitude numeric,
  longitude numeric,
  source_system text check (source_system in ('atlas','lighthouse','sunam','manual_seed','imported_script','unknown')),
  origin_type text check (origin_type in ('atlas_bridged','lighthouse_native','manual_seed','copied','mixed','unknown')),
  source_id uuid references api_source_registry(id),
  pull_run_id uuid references api_pull_run(id),
  raw_record_id uuid references raw_api_record(id),
  normalized_resource_id uuid references normalized_civic_resource(id),
  resource_bridge_id uuid,
  signal_bridge_id uuid,
  legal_bridge_id uuid,
  signal_rule_id text,
  signal_rule_version text,
  signal_generation_run_id uuid,
  source_snapshot_hash text,
  raw_payload_hash text,
  signal_fingerprint text not null,
  signal_hash text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint chk_detected_signals_v2_bridge_or_origin check (origin_type <> 'atlas_bridged' or signal_bridge_id is not null or legal_bridge_id is not null or resource_bridge_id is not null)
);
create index if not exists idx_detected_signals_v2_type on detected_signals_v2(signal_type);
create index if not exists idx_detected_signals_v2_severity on detected_signals_v2(severity);
create index if not exists idx_detected_signals_v2_source_origin on detected_signals_v2(source_system, origin_type);
create index if not exists idx_detected_signals_v2_geo on detected_signals_v2(state, county, city);
create index if not exists idx_detected_signals_v2_created on detected_signals_v2(created_at desc);
drop trigger if exists trg_detected_signals_v2_updated on detected_signals_v2;
create trigger trg_detected_signals_v2_updated before update on detected_signals_v2 for each row execute function set_updated_at_timestamp();

create table if not exists signal_source_link (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null,
  signal_table text not null,
  raw_record_id uuid references raw_api_record(id),
  normalized_resource_id uuid references normalized_civic_resource(id),
  resource_bridge_id uuid,
  signal_bridge_id uuid,
  legal_bridge_id uuid,
  source_id uuid references api_source_registry(id),
  pull_run_id uuid references api_pull_run(id),
  signal_generation_run_id uuid,
  signal_rule_id text not null,
  signal_rule_version text not null,
  source_system text check (source_system in ('atlas','lighthouse','sunam','manual_seed','imported_script','unknown')),
  origin_type text check (origin_type in ('atlas_bridged','lighthouse_native','manual_seed','copied','mixed','unknown')),
  evidence_basis text check (evidence_basis in ('direct_row_provenance','bridge_table_match','shared_source_match_only','manual_seed_script','generated_by_lighthouse_pipeline_no_atlas_bridge','inferred_unproven','unknown')),
  confidence_score numeric,
  created_at timestamptz default now(),
  constraint chk_signal_source_link_bridge_or_origin check (origin_type <> 'atlas_bridged' or signal_bridge_id is not null or legal_bridge_id is not null or resource_bridge_id is not null)
);
create index if not exists idx_signal_source_link_signal on signal_source_link(signal_table, signal_id);
create index if not exists idx_signal_source_link_origin on signal_source_link(source_system, origin_type);
create index if not exists idx_signal_source_link_source on signal_source_link(source_id);
create index if not exists idx_signal_source_link_raw on signal_source_link(raw_record_id);

create or replace view v_unproven_atlas_signal_claims as
select s.id as signal_id, s.signal_type, s.signal_description, s.severity, s.confidence_score, s.origin_type, s.source_system, s.state, s.county, s.city, s.signal_fingerprint, s.signal_hash, s.created_at, s.resource_bridge_id, s.signal_bridge_id, s.legal_bridge_id
from detected_signals_v2 s
where s.origin_type = 'atlas_bridged' and s.resource_bridge_id is null and s.signal_bridge_id is null and s.legal_bridge_id is null;
comment on view v_unproven_atlas_signal_claims is 'Signals claiming atlas_bridged origin but lacking any bridge table linkage. Requires review or bridge backfill.';

create or replace view v_lighthouse_native_signals as
select s.id as signal_id, s.signal_type, s.signal_description, s.severity, s.confidence_score, s.origin_type, s.source_system, s.state, s.county, s.city, s.latitude, s.longitude, s.signal_fingerprint, s.signal_hash, s.created_at
from detected_signals_v2 s
where s.origin_type = 'lighthouse_native' and s.source_system = 'lighthouse';
comment on view v_lighthouse_native_signals is 'Signals originating from Lighthouse-native pipelines. No Atlas bridge required by design.';

create or replace view v_api_pull_provenance_summary as
select r.id as source_id, r.source_key, r.source_name, r.source_type, r.domain, r.jurisdiction_scope, r.geographic_scope, r.is_active,
  count(distinct p.id) as total_pull_runs,
  count(distinct p.id) filter (where p.status = 'success') as success_runs,
  count(distinct p.id) filter (where p.status = 'failed') as failed_runs,
  count(distinct raw.id) as total_raw_records,
  count(distinct raw.id) filter (where raw.provenance_status = 'normalized') as normalized_records,
  count(distinct raw.id) filter (where raw.provenance_status = 'rejected') as rejected_records,
  max(p.started_at) as last_pull_at,
  max(raw.retrieved_at) as last_record_at
from api_source_registry r
left join api_pull_run p on p.source_id = r.id
left join raw_api_record raw on raw.source_id = r.id
group by r.id, r.source_key, r.source_name, r.source_type, r.domain, r.jurisdiction_scope, r.geographic_scope, r.is_active;
comment on view v_api_pull_provenance_summary is 'Operational dashboard: per-source pull health, record counts, and freshness.';
