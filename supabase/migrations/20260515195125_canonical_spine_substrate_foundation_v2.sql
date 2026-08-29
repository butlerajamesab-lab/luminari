create extension if not exists pgcrypto;

create table if not exists public.constitutional_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  doctrine_type text not null,
  doctrine_text text not null,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.constitutional_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.canonical_room_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  room_name text not null unique,
  functional_role text not null,
  description text,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.canonical_pathway_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  description text,
  room_id uuid references public.canonical_room_registry(id),
  procedural_domain text,
  urgency_profile text,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.canonical_pathway_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.canonical_procedural_state_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  state_name text not null,
  stage_order integer not null,
  description text,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.canonical_procedural_state_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.canonical_contradiction_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  contradiction_type text not null,
  governing_expectation text,
  observed_reality text,
  harm_vector text,
  escalation_required boolean default false,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.canonical_contradiction_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.canonical_signal_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  signal_type text not null,
  severity text,
  source_layer text,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.canonical_signal_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.provenance_registry (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  source_chain jsonb not null default '[]'::jsonb,
  transformation_path jsonb not null default '[]'::jsonb,
  output_justification text,
  replayable boolean not null default true,
  constitutional_alignment boolean not null default true,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.provenance_registry(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create table if not exists public.constitutional_violation_log (
  id uuid primary key default gen_random_uuid(),
  violation_key text not null unique,
  violation_type text not null,
  affected_system text,
  constitutional_rule text,
  severity text,
  description text,
  remediation_state text default 'open',
  constitutional_alignment boolean not null default false,
  verification_state text not null default 'verified',
  provenance_complete boolean not null default true,
  deterministic boolean not null default true,
  jurisdiction_scope text[] default array['national'],
  supersedes_id uuid references public.constitutional_violation_log(id),
  run_context jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  deterministic_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'system'
);

create index if not exists idx_pathway_registry_key on public.canonical_pathway_registry(canonical_key);
create index if not exists idx_state_registry_order on public.canonical_procedural_state_registry(stage_order);
create index if not exists idx_contradiction_registry_type on public.canonical_contradiction_registry(contradiction_type);
create index if not exists idx_signal_registry_type on public.canonical_signal_registry(signal_type);
create index if not exists idx_violation_log_type on public.constitutional_violation_log(violation_type);

alter table public.constitutional_registry enable row level security;
alter table public.canonical_room_registry enable row level security;
alter table public.canonical_pathway_registry enable row level security;
alter table public.canonical_procedural_state_registry enable row level security;
alter table public.canonical_contradiction_registry enable row level security;
alter table public.canonical_signal_registry enable row level security;
alter table public.provenance_registry enable row level security;
alter table public.constitutional_violation_log enable row level security;

do $$ begin
create policy "read_constitutional_registry" on public.constitutional_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_room_registry" on public.canonical_room_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_pathway_registry" on public.canonical_pathway_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_state_registry" on public.canonical_procedural_state_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_contradiction_registry" on public.canonical_contradiction_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_signal_registry" on public.canonical_signal_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_provenance_registry" on public.provenance_registry for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
create policy "read_violation_log" on public.constitutional_violation_log for select using (true);
exception when duplicate_object then null; end $$;
