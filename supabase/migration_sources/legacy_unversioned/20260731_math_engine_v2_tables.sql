-- Baseline substrate for Math Engine v2. Subsequent migrations harden this schema.
create table if not exists public.geography_registry (
  id text primary key,
  area_sq_km numeric not null check (area_sq_km > 0),
  centroid_lat numeric,
  centroid_lon numeric,
  adjacency jsonb not null default '[]'::jsonb,
  version text not null default '1.0.0',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.convergence_receipts (
  id uuid primary key default gen_random_uuid(),
  equation_id text not null,
  engine_version text not null,
  rule_manifest_hash text not null,
  as_of bigint not null,
  configuration_hash text not null,
  input_hash text not null,
  source_signal_ids jsonb not null default '[]'::jsonb,
  geography_registry_version text not null,
  expected_count numeric,
  observed_count integer not null,
  computed_outputs jsonb not null default '{}'::jsonb,
  timestamp_computed bigint not null,
  created_at timestamptz not null default now()
);
create table if not exists public.claim_definitions (
  id uuid primary key default gen_random_uuid(),
  claim_type text not null,
  jurisdiction text not null,
  elements jsonb not null default '[]'::jsonb,
  statute_of_limitations_days integer,
  source_statute text,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_type, jurisdiction)
);
create table if not exists public.case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  element_id text not null,
  strength numeric not null check (strength between 0 and 1),
  source_verified boolean not null default false,
  document_type text not null default 'document',
  source_url text,
  description text,
  created_at timestamptz not null default now()
);
alter table public.geography_registry enable row level security;
alter table public.convergence_receipts enable row level security;
alter table public.claim_definitions enable row level security;
alter table public.case_evidence enable row level security;
