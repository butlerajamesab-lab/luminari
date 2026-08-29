begin;

-- Production's Atlas-to-Lighthouse transport bridge and verified projection
-- were created outside the checked-in ledger. Reconstruct the exact contract
-- before the Domain 3 pull-through migration that consumes it.
create table if not exists public.atlas_lighthouse_signal_bridge_v1 (
  bridge_record_id uuid primary key default gen_random_uuid(),
  atlas_signal_id bigint not null,
  signal_type text not null,
  source_system text not null default 'atlas'
    check (source_system = 'atlas'),
  bridge_version text not null default 'atlas_lighthouse_bridge_v1'
    check (bridge_version = 'atlas_lighthouse_bridge_v1'),
  source_connector_id uuid not null,
  raw_record_id uuid not null,
  statute_id uuid not null,
  entity_ids text[],
  jurisdiction_raw_value text,
  jurisdiction_id text,
  source_url text not null check (length(btrim(source_url)) > 0),
  detected_at timestamptz not null,
  bridged_at timestamptz not null default now(),
  confidence_score numeric,
  severity text,
  signal_status text not null check (signal_status = 'active'),
  rule_id text not null,
  rule_version text not null,
  generation_method text not null check (generation_method = 'deterministic_rule'),
  record_origin text not null check (record_origin = 'live_api'),
  verification_status text not null check (verification_status = 'verified'),
  evidence_payload jsonb not null default '{}'::jsonb,
  provenance_metadata jsonb not null default '{}'::jsonb,
  atlas_metadata_json jsonb not null default '{}'::jsonb,
  atlas_signal_dedup_key text,
  source_view text not null default 'public.v_civic_map_signals_production'
    check (source_view = 'public.v_civic_map_signals_production'),
  bridge_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists atlas_lighthouse_signal_bridge_v1_atlas_signal_uidx
  on public.atlas_lighthouse_signal_bridge_v1(atlas_signal_id);
create unique index if not exists atlas_lighthouse_signal_bridge_v1_dedup_uidx
  on public.atlas_lighthouse_signal_bridge_v1(
    source_connector_id, signal_type, statute_id, rule_id
  );
create index if not exists atlas_lighthouse_signal_bridge_v1_source_connector_idx
  on public.atlas_lighthouse_signal_bridge_v1(source_connector_id);
create index if not exists atlas_lighthouse_signal_bridge_v1_statute_idx
  on public.atlas_lighthouse_signal_bridge_v1(statute_id);
create index if not exists atlas_lighthouse_signal_bridge_v1_type_idx
  on public.atlas_lighthouse_signal_bridge_v1(signal_type);

alter table public.atlas_lighthouse_signal_bridge_v1 enable row level security;
revoke all on table public.atlas_lighthouse_signal_bridge_v1
  from public, anon, authenticated;
grant all on table public.atlas_lighthouse_signal_bridge_v1 to service_role;

drop policy if exists atlas_lighthouse_signal_bridge_service_role_all
  on public.atlas_lighthouse_signal_bridge_v1;
create policy atlas_lighthouse_signal_bridge_service_role_all
  on public.atlas_lighthouse_signal_bridge_v1
  for all to service_role using (true) with check (true);

create or replace view public.v_atlas_lighthouse_bridge_v1_verified
with (security_invoker = true) as
select *
from public.atlas_lighthouse_signal_bridge_v1
where source_system = 'atlas'
  and bridge_version = 'atlas_lighthouse_bridge_v1'
  and generation_method = 'deterministic_rule'
  and verification_status = 'verified'
  and record_origin = 'live_api'
  and signal_status = 'active'
  and source_connector_id is not null
  and raw_record_id is not null
  and statute_id is not null
  and source_url is not null
  and length(btrim(source_url)) > 0;

revoke all on table public.v_atlas_lighthouse_bridge_v1_verified
  from public, anon, authenticated;
grant select on table public.v_atlas_lighthouse_bridge_v1_verified to service_role;

commit;
