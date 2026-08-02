-- Living Civic Genome operating substrate.
-- Additive only: no Docket Room, LegiScan, existing Genome row, or Lighthouse backbone mutation.

create table if not exists public.civic_genome_trait (
  trait_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  trait_class text not null,
  trait_key text not null,
  normalized_value_json jsonb not null default 'null'::jsonb,
  source_object_type text not null,
  source_object_id text not null,
  source_block_id text,
  extraction_run_id uuid,
  confidence_score numeric(6,5) not null default 0,
  signal_status text not null,
  trait_fingerprint text not null,
  methodology_version text not null,
  source_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_trait_confidence_check check (confidence_score >= 0 and confidence_score <= 1),
  constraint civic_genome_trait_signal_status_check check (
    signal_status in ('confirmed', 'tentative', 'human_review_required', 'rejected')
  ),
  constraint civic_genome_trait_fingerprint_unique unique (trait_fingerprint)
);

create index if not exists idx_civic_genome_trait_genome_bill_id
  on public.civic_genome_trait(genome_bill_id);
create index if not exists idx_civic_genome_trait_class_key
  on public.civic_genome_trait(trait_class, trait_key);
create index if not exists idx_civic_genome_trait_extraction_run_id
  on public.civic_genome_trait(extraction_run_id)
  where extraction_run_id is not null;

create table if not exists public.civic_genome_relationship (
  relationship_id uuid primary key default gen_random_uuid(),
  family_id uuid references public.civic_genome_family(family_id) on delete set null,
  source_entity_type text not null,
  source_entity_id text not null,
  target_entity_type text not null,
  target_entity_id text not null,
  relationship_type text not null,
  direction text not null default 'uni',
  support_count integer not null default 0,
  confidence_score numeric(6,5) not null default 0,
  strength_score numeric(6,5) not null default 0,
  validation_state text not null default 'observed',
  evidence_refs jsonb not null default '[]'::jsonb,
  relationship_fingerprint text not null,
  methodology_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_relationship_confidence_check check (confidence_score >= 0 and confidence_score <= 1),
  constraint civic_genome_relationship_strength_check check (strength_score >= 0 and strength_score <= 1),
  constraint civic_genome_relationship_direction_check check (direction in ('uni', 'bi')),
  constraint civic_genome_relationship_validation_check check (
    validation_state in ('observed', 'validated', 'rejected', 'human_review_required')
  ),
  constraint civic_genome_relationship_fingerprint_unique unique (relationship_fingerprint)
);

create index if not exists idx_civic_genome_relationship_family_id
  on public.civic_genome_relationship(family_id);
create index if not exists idx_civic_genome_relationship_source
  on public.civic_genome_relationship(source_entity_type, source_entity_id);
create index if not exists idx_civic_genome_relationship_target
  on public.civic_genome_relationship(target_entity_type, target_entity_id);
create index if not exists idx_civic_genome_relationship_type
  on public.civic_genome_relationship(relationship_type);

create table if not exists public.civic_genome_unresolved_family_candidate (
  unresolved_candidate_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  policy_domain text not null,
  resolution_reason text not null,
  best_candidate_family_id uuid references public.civic_genome_family(family_id) on delete set null,
  best_candidate_score numeric(6,5) not null default 0,
  similarity_breakdown_json jsonb not null default '{}'::jsonb,
  competing_family_ids uuid[] not null default '{}',
  methodology_version text not null,
  observed_at timestamptz not null,
  resolved_at timestamptz,
  resolution_family_id uuid references public.civic_genome_family(family_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_unresolved_score_check check (best_candidate_score >= 0 and best_candidate_score <= 1),
  constraint civic_genome_unresolved_active_unique unique (genome_bill_id, methodology_version, observed_at)
);

create index if not exists idx_civic_genome_unresolved_bill
  on public.civic_genome_unresolved_family_candidate(genome_bill_id);
create index if not exists idx_civic_genome_unresolved_open
  on public.civic_genome_unresolved_family_candidate(observed_at desc)
  where resolved_at is null;

create table if not exists public.civic_genome_momentum_component (
  momentum_component_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.civic_genome_family(family_id) on delete cascade,
  component_type text not null,
  component_value numeric not null,
  component_payload_json jsonb not null default '{}'::jsonb,
  source_event_ids uuid[] not null default '{}',
  methodology_version text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint civic_genome_momentum_component_unique unique (
    family_id, component_type, methodology_version, observed_at
  )
);

create index if not exists idx_civic_genome_momentum_component_family
  on public.civic_genome_momentum_component(family_id, observed_at desc);

create table if not exists public.civic_genome_projection_checkpoint (
  checkpoint_id uuid primary key default gen_random_uuid(),
  projection_name text not null,
  state_code text not null,
  source_session_key text,
  source_fetched_at timestamptz,
  source_bill_count integer not null default 0,
  next_offset integer not null default 0,
  projected_count integer not null default 0,
  unchanged_count integer not null default 0,
  event_count integer not null default 0,
  projection_status text not null default 'ready',
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint civic_genome_projection_checkpoint_status_check check (
    projection_status in ('ready', 'running', 'complete', 'failed')
  ),
  constraint civic_genome_projection_checkpoint_unique unique (projection_name, state_code)
);

create index if not exists idx_civic_genome_projection_checkpoint_status
  on public.civic_genome_projection_checkpoint(projection_status, updated_at);

create table if not exists public.civic_genome_comparison_matrix (
  matrix_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.civic_genome_family(family_id) on delete cascade,
  family_label text not null,
  policy_domain text not null,
  comparison_axis text not null,
  methodology_version text not null,
  refresh_status text not null default 'ready',
  refresh_started_at timestamptz,
  refresh_completed_at timestamptz,
  generated_at timestamptz not null default now(),
  total_jurisdictions integer not null default 0,
  active_jurisdiction_count integer not null default 0,
  anomaly_jurisdiction_count integer not null default 0,
  contradiction_jurisdiction_count integer not null default 0,
  source_trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_comparison_matrix_status_check check (
    refresh_status in ('ready', 'running', 'complete', 'failed')
  ),
  constraint civic_genome_comparison_matrix_unique unique (
    family_id, comparison_axis, methodology_version
  )
);

create index if not exists idx_civic_genome_comparison_matrix_domain
  on public.civic_genome_comparison_matrix(policy_domain, generated_at desc);
create index if not exists idx_civic_genome_comparison_matrix_family
  on public.civic_genome_comparison_matrix(family_id);

create table if not exists public.civic_genome_comparison_state_cell (
  state_cell_id uuid primary key default gen_random_uuid(),
  matrix_id uuid not null references public.civic_genome_comparison_matrix(matrix_id) on delete cascade,
  family_id uuid not null references public.civic_genome_family(family_id) on delete cascade,
  jurisdiction_code text not null,
  state_position text not null,
  has_live_bill boolean not null default false,
  bill_count integer not null default 0,
  genome_bill_ids uuid[] not null default '{}',
  latest_genome_bill_id uuid references public.civic_genome_bill(genome_bill_id) on delete set null,
  latest_bill_status text,
  latest_action_at timestamptz,
  actor_vector jsonb not null default '[]'::jsonb,
  workflow_vector jsonb not null default '[]'::jsonb,
  enforcement_vector jsonb not null default '[]'::jsonb,
  exception_vector jsonb not null default '[]'::jsonb,
  contradiction_score numeric(6,5) not null default 0,
  anomaly_score numeric(6,5) not null default 0,
  similarity_group text,
  divergence_flags jsonb not null default '[]'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_comparison_state_position_check check (
    state_position in (
      'absent',
      'introduced',
      'active_in_committee',
      'advanced_one_chamber',
      'advanced_two_chambers',
      'enacted',
      'failed',
      'dormant',
      'structurally_divergent'
    )
  ),
  constraint civic_genome_comparison_contradiction_check check (
    contradiction_score >= 0 and contradiction_score <= 1
  ),
  constraint civic_genome_comparison_anomaly_check check (
    anomaly_score >= 0 and anomaly_score <= 1
  ),
  constraint civic_genome_comparison_state_cell_unique unique (matrix_id, jurisdiction_code)
);

create index if not exists idx_civic_genome_comparison_state_cell_matrix
  on public.civic_genome_comparison_state_cell(matrix_id);
create index if not exists idx_civic_genome_comparison_state_cell_jurisdiction
  on public.civic_genome_comparison_state_cell(jurisdiction_code);
create index if not exists idx_civic_genome_comparison_state_cell_anomaly
  on public.civic_genome_comparison_state_cell(anomaly_score desc);
create index if not exists idx_civic_genome_comparison_state_cell_contradiction
  on public.civic_genome_comparison_state_cell(contradiction_score desc);

comment on table public.civic_genome_trait is
  'Normalized, deterministic Rosetta-derived traits with complete source provenance.';
comment on table public.civic_genome_relationship is
  'Generic typed Civic Genome relationships; bill lineage remains in bill_lineage_edge.';
comment on table public.civic_genome_unresolved_family_candidate is
  'Preserves deterministic unresolved-family outcomes without forcing false family assignment.';
comment on table public.civic_genome_momentum_component is
  'Inspectable inputs used by versioned momentum calculations.';
comment on table public.civic_genome_projection_checkpoint is
  'Civic Genome-owned projection continuation state; Docket Room remains untouched.';
comment on table public.civic_genome_comparison_matrix is
  'Materialized Civic Genome national/jurisdictional comparison read model for Viewfinder.';
comment on table public.civic_genome_comparison_state_cell is
  'One deterministic jurisdiction position cell for a Civic Genome family comparison matrix.';
