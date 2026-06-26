create table if not exists civic_genome_family (
  family_id uuid primary key default gen_random_uuid(),
  family_key text not null unique,
  family_label text not null,
  policy_domain text not null,
  family_status text not null default 'active',
  first_seen_at timestamptz null,
  last_seen_at timestamptz null,
  first_enacted_at timestamptz null,
  last_event_at timestamptz null,
  active_state_count integer not null default 0,
  introduced_state_count integer not null default 0,
  enacted_state_count integer not null default 0,
  failed_state_count integer not null default 0,
  momentum_score numeric(6,5) not null default 0,
  acceleration_score numeric(6,5) not null default 0,
  collapse_score numeric(6,5) not null default 0,
  signature_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists civic_genome_bill (
  genome_bill_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references civic_genome_family(family_id) on delete cascade,
  bill_id uuid not null unique references canonical_bill(bill_id) on delete cascade,
  state_code text not null,
  session_key text not null,
  source_bill_number text not null,
  source_bill_title text null,
  source_bill_url text null,
  bill_status text null,
  introduced_at timestamptz null,
  last_action_at timestamptz null,
  enacted_at timestamptz null,
  rosetta_extraction_run_id uuid null references rosetta_extraction_run(extraction_run_id) on delete set null,
  structural_dna_hash text not null,
  structural_dna_json jsonb not null default '{}'::jsonb,
  procedural_lifecycle_json jsonb not null default '{}'::jsonb,
  jurisdiction_lineage_json jsonb not null default '{}'::jsonb,
  constitutional_dependency_json jsonb not null default '{}'::jsonb,
  fiscal_effects_json jsonb not null default '{}'::jsonb,
  enforcement_graph_json jsonb not null default '{}'::jsonb,
  downstream_impact_graph_json jsonb not null default '{}'::jsonb,
  current_state_position text not null default 'introduced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists civic_genome_event (
  event_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references civic_genome_family(family_id) on delete cascade,
  genome_bill_id uuid not null references civic_genome_bill(genome_bill_id) on delete cascade,
  bill_id uuid not null references canonical_bill(bill_id) on delete cascade,
  state_code text not null,
  event_type text not null,
  event_timestamp timestamptz not null,
  prior_status text null,
  next_status text null,
  amendment_version text null,
  source_trace jsonb not null default '[]'::jsonb,
  event_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists bill_lineage_edge (
  lineage_edge_id uuid primary key default gen_random_uuid(),
  family_id uuid null references civic_genome_family(family_id) on delete cascade,
  from_bill_id uuid not null references canonical_bill(bill_id) on delete cascade,
  to_bill_id uuid not null references canonical_bill(bill_id) on delete cascade,
  relationship_type text not null,
  confidence_score numeric(6,5) not null default 0,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_bill_id, to_bill_id, relationship_type)
);

create table if not exists family_momentum_snapshot (
  momentum_snapshot_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references civic_genome_family(family_id) on delete cascade,
  snapshot_date date not null,
  active_state_count integer not null default 0,
  introduced_state_count integer not null default 0,
  enacted_state_count integer not null default 0,
  failed_state_count integer not null default 0,
  new_state_count integer not null default 0,
  velocity_score numeric(6,5) not null default 0,
  acceleration_score numeric(6,5) not null default 0,
  collapse_score numeric(6,5) not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, snapshot_date)
);

create index if not exists idx_civic_genome_bill_family_id on civic_genome_bill(family_id);
create index if not exists idx_civic_genome_bill_state_code on civic_genome_bill(state_code);
create index if not exists idx_civic_genome_event_family_id on civic_genome_event(family_id);
create index if not exists idx_civic_genome_event_event_timestamp on civic_genome_event(event_timestamp desc);
create index if not exists idx_bill_lineage_edge_family_id on bill_lineage_edge(family_id);
create index if not exists idx_family_momentum_snapshot_family_id on family_momentum_snapshot(family_id);
