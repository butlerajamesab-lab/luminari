-- Lighthouse-side ledger for automatic problem-instance handoff into Prism.
-- The canonical Lighthouse problem_instances table remains unchanged.

create table if not exists public.lighthouse_prism_problem_handoff (
  id uuid primary key default gen_random_uuid(),
  origin_problem_instance_id uuid not null references public.problem_instances(id),
  origin_record_id text not null,
  source_snapshot_hash text not null check (source_snapshot_hash ~ '^[a-f0-9]{64}$'),
  handoff_state text not null default 'PENDING' check (handoff_state in ('PENDING','COMPLETED','DEGRADED','PERMANENT_FAILURE')),
  prism_problem_instance_id uuid,
  prism_normalized_hash text check (prism_normalized_hash is null or prism_normalized_hash ~ '^[a-f0-9]{64}$'),
  eligible_pair_count integer not null default 0 check (eligible_pair_count >= 0),
  failure_class text,
  failure_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  first_attempted_at timestamptz,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_problem_instance_id, source_snapshot_hash)
);

create index if not exists lighthouse_prism_problem_handoff_state_idx
  on public.lighthouse_prism_problem_handoff(handoff_state, last_attempted_at);
create index if not exists lighthouse_prism_problem_handoff_origin_idx
  on public.lighthouse_prism_problem_handoff(origin_problem_instance_id, updated_at desc);

alter table public.lighthouse_prism_problem_handoff enable row level security;
revoke all on public.lighthouse_prism_problem_handoff from public, anon, authenticated;

comment on table public.lighthouse_prism_problem_handoff is
  'Durable Lighthouse execution ledger for automatic, idempotent problem-instance handoff to Prism. One handoff row represents one exact source snapshot, not one raw Atlas record.';
