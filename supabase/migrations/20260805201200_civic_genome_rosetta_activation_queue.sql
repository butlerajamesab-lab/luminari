begin;

create table if not exists public.civic_genome_rosetta_generation_activation_queue (
  activation_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_document_id bigint not null,
  extraction_run_id bigint not null check (extraction_run_id > 0),
  queue_state text not null default 'eligible'
    check (queue_state in ('eligible', 'submitted', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  assembly_run_id uuid references public.civic_genome_assembly_run(assembly_run_id),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_rosetta_generation_activation_unique
    unique (genome_bill_id, source_document_id, extraction_run_id)
);

create index if not exists idx_rosetta_generation_activation_claim
  on public.civic_genome_rosetta_generation_activation_queue(
    queue_state,
    next_attempt_at,
    created_at
  );

alter table public.civic_genome_rosetta_generation_activation_queue
  enable row level security;

revoke all on table public.civic_genome_rosetta_generation_activation_queue
  from public, anon, authenticated;
grant select, insert, update on table public.civic_genome_rosetta_generation_activation_queue
  to service_role;

comment on table public.civic_genome_rosetta_generation_activation_queue is
  'Durable exact-identity queue for assembling one specified Rosetta extraction generation into Civic Genome. It never searches or infers a source binding.';
comment on column public.civic_genome_rosetta_generation_activation_queue.extraction_run_id is
  'Exact Rosetta extraction run required by the activation. A latest-run substitution is rejected by the existing backfill contract.';

commit;
