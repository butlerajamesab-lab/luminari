begin;

create table if not exists public.registry_deadline_rules (
  id uuid primary key default gen_random_uuid(),
  source_extraction_id text,
  jurisdiction text not null,
  jurisdiction_type text,
  claim_type text,
  deadline_type text not null,
  trigger_event text not null,
  deadline_text text not null,
  days_count integer null,
  is_plan_governed boolean default false,
  consequence text not null,
  source_url text,
  source_citation text,
  provenance jsonb default '{}'::jsonb,
  dedupe_key text not null unique,
  validation_status text default 'pending',
  promotion_status text default 'pending',
  lifecycle_status text default 'live',
  source_mode text default 'canonical',
  last_live_check_at timestamptz,
  last_verified_at timestamptz,
  next_refresh_due_at timestamptz,
  fallback_reason text,
  retirement_reason text,
  replacement_record_id uuid null,
  history_preserved boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_registry_deadline_rules_jurisdiction on public.registry_deadline_rules(jurisdiction);
create index if not exists idx_registry_deadline_rules_claim_type on public.registry_deadline_rules(claim_type);
create index if not exists idx_registry_deadline_rules_lifecycle on public.registry_deadline_rules(lifecycle_status);
create index if not exists idx_registry_deadline_rules_promotion on public.registry_deadline_rules(promotion_status);

create table if not exists public.atlas_lighthouse_deadline_bridge_v1 (
  bridge_record_id uuid primary key default gen_random_uuid(),
  canonical_deadline_id uuid not null references public.registry_deadline_rules(id) on delete restrict,
  atlas_deadline_id text,
  jurisdiction text,
  claim_type text,
  deadline_type text,
  trigger_event text,
  deadline_text text,
  days_count integer,
  consequence text,
  source_url text,
  source_citation text,
  verification_status text default 'bridged',
  bridge_version text default 'v1',
  lifecycle_status text default 'live',
  bridge_metadata jsonb default '{}'::jsonb,
  bridged_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (canonical_deadline_id, bridge_version)
);

create index if not exists idx_atlas_deadline_bridge_canonical on public.atlas_lighthouse_deadline_bridge_v1(canonical_deadline_id);
create index if not exists idx_atlas_deadline_bridge_jurisdiction on public.atlas_lighthouse_deadline_bridge_v1(jurisdiction);
create index if not exists idx_atlas_deadline_bridge_lifecycle on public.atlas_lighthouse_deadline_bridge_v1(lifecycle_status);

create table if not exists public.conveyor_runs (
  run_id uuid primary key default gen_random_uuid(),
  lane text not null,
  action_type text not null,
  is_dry_run boolean not null default false,
  status text not null default 'started',
  candidate_count integer default 0,
  passed_count integer default 0,
  failed_count integer default 0,
  promoted_count integer default 0,
  skipped_duplicate_count integer default 0,
  bridged_count integer default 0,
  started_at timestamptz default now(),
  finished_at timestamptz,
  metadata jsonb default '{}'::jsonb
);

create table if not exists public.conveyor_validation_log (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.conveyor_runs(run_id) on delete cascade,
  lane text not null,
  source_table text,
  source_record_id text,
  validation_status text not null,
  validation_errors jsonb default '[]'::jsonb,
  normalized_payload jsonb default '{}'::jsonb,
  dedupe_key text,
  is_dry_run boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_conveyor_validation_log_run on public.conveyor_validation_log(run_id);
create index if not exists idx_conveyor_validation_log_lane_status on public.conveyor_validation_log(lane, validation_status);
create index if not exists idx_conveyor_validation_log_dedupe on public.conveyor_validation_log(dedupe_key);

create table if not exists public.conveyor_promotion_accounting (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.conveyor_runs(run_id) on delete cascade,
  lane text not null,
  action_type text not null,
  is_dry_run boolean not null default false,
  source_record_id text,
  canonical_record_id uuid,
  bridge_record_id uuid,
  status text not null,
  reason text,
  dedupe_key text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_conveyor_promotion_accounting_run on public.conveyor_promotion_accounting(run_id);
create index if not exists idx_conveyor_promotion_accounting_lane_status on public.conveyor_promotion_accounting(lane, status);
create index if not exists idx_conveyor_promotion_accounting_dedupe on public.conveyor_promotion_accounting(dedupe_key);

create or replace view public.v_conveyor_deadline_status as
select
  'deadline'::text as lane,
  (select count(*) from public.registry_entity_extraction_v4 where lower(coalesce(program_id,'') || ' ' || coalesce(name,'') || ' ' || coalesce(promotion_ready::text,'')) ~ '(deadline|deadline_rule|workflow_deadline|procedural_path)') as v4_candidate_rows,
  (select count(*) from public.extraction_staging where lower(coalesce(signal_type,'') || ' ' || coalesce(title,'') || ' ' || coalesce(explanation,'') || ' ' || coalesce(pattern_summary,'')) ~ '(deadline|deadline_rule|workflow_deadline|procedural_path)') as staging_candidate_rows,
  (select count(*) from public.conveyor_validation_log where lane='deadline' and validation_status='pass') as validation_passed,
  (select count(*) from public.conveyor_validation_log where lane='deadline' and validation_status='fail') as validation_failed,
  (select count(*) from public.registry_deadline_rules) as promoted_canonical_rows,
  (select count(*) from public.atlas_lighthouse_deadline_bridge_v1) as bridged_rows,
  (select status from public.conveyor_runs where lane='deadline' order by started_at desc limit 1) as last_run_status,
  (select started_at from public.conveyor_runs where lane='deadline' order by started_at desc limit 1) as last_run_at;

create or replace view public.v_atlas_deadline_runtime as
select
  b.bridge_record_id,
  b.canonical_deadline_id,
  b.atlas_deadline_id,
  b.jurisdiction,
  b.claim_type,
  b.deadline_type,
  b.trigger_event,
  b.deadline_text,
  b.days_count,
  b.consequence,
  b.source_url,
  b.source_citation,
  b.verification_status,
  b.bridge_version,
  b.lifecycle_status,
  b.bridge_metadata,
  b.bridged_at,
  d.source_mode,
  d.last_live_check_at,
  d.last_verified_at,
  d.next_refresh_due_at,
  d.fallback_reason,
  d.retirement_reason,
  d.replacement_record_id,
  d.history_preserved
from public.atlas_lighthouse_deadline_bridge_v1 b
join public.registry_deadline_rules d on d.id = b.canonical_deadline_id
where b.lifecycle_status in ('live','cached_current','fallback','updating','stale')
  and d.lifecycle_status in ('live','cached_current','fallback','updating','stale');

commit;
