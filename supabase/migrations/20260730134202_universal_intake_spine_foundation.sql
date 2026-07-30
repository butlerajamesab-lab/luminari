-- Universal Lighthouse Intake Spine foundation
-- Live Supabase migration: 20260730134202_universal_intake_spine_foundation

create or replace function public.luminari_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.case_identity_bridge (
  case_uuid uuid primary key default gen_random_uuid(),
  legacy_case_id integer not null unique references public.cases(id) on delete cascade,
  identity_version text not null default '1.0.0',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intake_sessions (
  intake_session_id uuid primary key default gen_random_uuid(),
  owner_user_id integer,
  session_type text not null default 'live'
    check (session_type in ('live','fixture','assisted','system')),
  entry_channel text not null,
  source_label text,
  fixture_id text,
  fixture_version text,
  privacy_mode text not null default 'restricted'
    check (privacy_mode in ('restricted','private','internal_test','public_safe')),
  session_status text not null default 'open'
    check (session_status in ('open','paused','completed','cancelled','failed','archived')),
  completion_state text not null default 'started',
  user_selected_immediate_issue text,
  is_paused boolean not null default false,
  source_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((fixture_id is null and fixture_version is null) or (fixture_id is not null and fixture_version is not null))
);

create unique index if not exists ux_intake_sessions_fixture_version
  on public.intake_sessions (fixture_id, fixture_version)
  where fixture_id is not null;
create index if not exists idx_intake_sessions_owner_user_id
  on public.intake_sessions (owner_user_id);
create index if not exists idx_intake_sessions_status
  on public.intake_sessions (session_status);
create index if not exists idx_intake_sessions_source_fingerprint
  on public.intake_sessions (source_fingerprint)
  where source_fingerprint is not null;

create table if not exists public.case_intake_links (
  case_intake_link_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  case_uuid uuid not null references public.case_identity_bridge(case_uuid) on delete cascade,
  link_type text not null default 'primary_projection'
    check (link_type in ('primary_projection','related','imported_legacy','assisted_intake')),
  is_primary boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (intake_session_id, case_uuid)
);
create unique index if not exists ux_case_intake_links_one_primary_session
  on public.case_intake_links (intake_session_id)
  where is_primary;
create index if not exists idx_case_intake_links_case_uuid
  on public.case_intake_links (case_uuid);

create table if not exists public.intake_entry_run_links (
  intake_entry_run_link_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  entry_run_id uuid not null references public.entry_runs(id) on delete cascade,
  link_role text not null default 'source_ingestion'
    check (link_role in ('source_ingestion','reprocessing','late_addition','legacy_import')),
  created_at timestamptz not null default now(),
  unique (intake_session_id, entry_run_id)
);

create table if not exists public.intake_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  artifact_key text not null,
  parent_artifact_id uuid references public.intake_artifacts(artifact_id) on delete set null,
  source_family text,
  artifact_type text not null,
  evidence_tier text not null,
  availability text not null,
  filename text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  source_date_from date,
  source_date_to date,
  storage_bucket text,
  storage_object_path text,
  privacy_classification text not null default 'restricted',
  artifact_status text not null default 'registered'
    check (artifact_status in ('registered','preserved','referenced_missing','superseded','quarantined')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intake_session_id, artifact_key),
  check (parent_artifact_id is null or parent_artifact_id <> artifact_id),
  check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  check (byte_size is null or byte_size >= 0),
  check (source_date_to is null or source_date_from is null or source_date_to >= source_date_from)
);
create index if not exists idx_intake_artifacts_session
  on public.intake_artifacts (intake_session_id);
create index if not exists idx_intake_artifacts_parent
  on public.intake_artifacts (parent_artifact_id);
create index if not exists idx_intake_artifacts_sha256
  on public.intake_artifacts (sha256)
  where sha256 is not null;

create table if not exists public.stabilization_snapshots (
  stabilization_snapshot_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  checkpoint_key text not null,
  as_of_event_key text,
  immediate_concern text,
  most_urgent_event text,
  signals jsonb not null default '[]'::jsonb,
  deadlines jsonb not null default '[]'::jsonb,
  irreversible_events jsonb not null default '[]'::jsonb,
  essential_services_at_risk jsonb not null default '[]'::jsonb,
  evidence_to_preserve jsonb not null default '[]'::jsonb,
  communication_limits jsonb not null default '[]'::jsonb,
  support_people jsonb not null default '[]'::jsonb,
  capacity_constraints jsonb not null default '[]'::jsonb,
  least_burdensome_next_action jsonb not null default '{}'::jsonb,
  what_can_wait jsonb not null default '[]'::jsonb,
  reassess_at timestamptz,
  snapshot_status text not null default 'active'
    check (snapshot_status in ('active','superseded','resolved','cancelled')),
  rule_version text not null,
  input_hash text not null,
  output_hash text not null,
  supersedes_id uuid references public.stabilization_snapshots(stabilization_snapshot_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (intake_session_id, checkpoint_key, output_hash),
  check (supersedes_id is null or supersedes_id <> stabilization_snapshot_id)
);
create index if not exists idx_stabilization_snapshots_session
  on public.stabilization_snapshots (intake_session_id, created_at desc);
create index if not exists idx_stabilization_snapshots_reassess_at
  on public.stabilization_snapshots (reassess_at)
  where snapshot_status = 'active' and reassess_at is not null;

create table if not exists public.intake_layer_runs (
  layer_run_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  layer_name text not null check (layer_name in (
    'stabilization_envelope','raw_intake_capture','evidence_preservation',
    'chronology_reconstruction','verification_gate','entity_registry',
    'relationship_graph','power_dynamics_registry','state_timeline',
    'pattern_registry','cascade_registry','rights_and_duties_matrix',
    'translation_layer','action_paths'
  )),
  layer_version text not null,
  rule_version text not null,
  normalization_version text,
  run_status text not null default 'pending'
    check (run_status in ('pending','running','completed','failed','superseded','cancelled')),
  input_hash text not null,
  output_hash text,
  input_refs jsonb not null default '[]'::jsonb,
  output_refs jsonb not null default '[]'::jsonb,
  unresolved_dependencies jsonb not null default '[]'::jsonb,
  receipt jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  is_sealed boolean not null default false,
  sealed_at timestamptz,
  supersedes_id uuid references public.intake_layer_runs(layer_run_id) on delete set null,
  check (supersedes_id is null or supersedes_id <> layer_run_id),
  check ((is_sealed = false and sealed_at is null) or (is_sealed = true and sealed_at is not null)),
  check (completed_at is null or completed_at >= started_at)
);
create unique index if not exists ux_intake_layer_runs_deterministic_input
  on public.intake_layer_runs (intake_session_id, layer_name, layer_version, input_hash)
  where run_status <> 'superseded';
create index if not exists idx_intake_layer_runs_session_layer
  on public.intake_layer_runs (intake_session_id, layer_name, started_at desc);

create table if not exists public.intake_verification_records (
  verification_record_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  target_type text not null,
  target_key text not null,
  assertion_text text,
  verification_state text not null check (verification_state in (
    'user_reported','document_stated','institutional_claim','supported_by_one_source',
    'supported_by_multiple_sources','contradicted','disputed','incomplete',
    'unresolved','verified','inference'
  )),
  source_refs jsonb not null default '[]'::jsonb,
  contradiction_refs jsonb not null default '[]'::jsonb,
  rule_version text not null,
  supersedes_id uuid references public.intake_verification_records(verification_record_id) on delete set null,
  created_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> verification_record_id)
);
create index if not exists idx_intake_verification_target
  on public.intake_verification_records (intake_session_id, target_type, target_key, created_at desc);

create table if not exists public.intake_state_transitions (
  transition_id uuid primary key default gen_random_uuid(),
  intake_session_id uuid not null references public.intake_sessions(intake_session_id) on delete cascade,
  target_type text not null,
  target_key text not null,
  transition_type text not null,
  from_state jsonb,
  to_state jsonb not null,
  reason text,
  source_layer_run_id uuid references public.intake_layer_runs(layer_run_id) on delete set null,
  source_artifact_id uuid references public.intake_artifacts(artifact_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_intake_state_transitions_target
  on public.intake_state_transitions (intake_session_id, target_type, target_key, created_at);

create trigger trg_case_identity_bridge_updated_at
before update on public.case_identity_bridge
for each row execute function public.luminari_set_updated_at();

create trigger trg_intake_sessions_updated_at
before update on public.intake_sessions
for each row execute function public.luminari_set_updated_at();

create trigger trg_intake_artifacts_updated_at
before update on public.intake_artifacts
for each row execute function public.luminari_set_updated_at();

alter table public.case_identity_bridge enable row level security;
alter table public.intake_sessions enable row level security;
alter table public.case_intake_links enable row level security;
alter table public.intake_entry_run_links enable row level security;
alter table public.intake_artifacts enable row level security;
alter table public.stabilization_snapshots enable row level security;
alter table public.intake_layer_runs enable row level security;
alter table public.intake_verification_records enable row level security;
alter table public.intake_state_transitions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.case_identity_bridge, public.intake_sessions, public.case_intake_links,
      public.intake_entry_run_links, public.intake_artifacts, public.stabilization_snapshots,
      public.intake_layer_runs, public.intake_verification_records, public.intake_state_transitions
      from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.case_identity_bridge, public.intake_sessions, public.case_intake_links,
      public.intake_entry_run_links, public.intake_artifacts, public.stabilization_snapshots,
      public.intake_layer_runs, public.intake_verification_records, public.intake_state_transitions
      from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.case_identity_bridge, public.intake_sessions, public.case_intake_links,
      public.intake_entry_run_links, public.intake_artifacts, public.stabilization_snapshots,
      public.intake_layer_runs, public.intake_verification_records, public.intake_state_transitions
      to service_role;
  end if;
end
$$;