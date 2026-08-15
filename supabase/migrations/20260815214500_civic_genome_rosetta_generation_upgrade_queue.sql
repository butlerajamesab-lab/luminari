begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.civic_genome_rosetta_generation_upgrade_queue (
  upgrade_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_document_id bigint not null,
  source_identity_hash text not null check (source_identity_hash ~ '^[0-9a-f]{64}$'),
  target_engine_version text not null,
  target_rule_set_version text not null,
  target_rule_manifest_hash text,
  queue_state text not null default 'eligible'
    check (queue_state in ('eligible','running','retry','completed','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  extraction_run_id bigint,
  assembly_run_id uuid references public.civic_genome_assembly_run(assembly_run_id) on delete set null,
  completed_at timestamptz,
  last_error_code text,
  last_error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_document_id, target_engine_version, target_rule_set_version)
);

create index if not exists civic_genome_rosetta_generation_upgrade_queue_claim_idx
  on public.civic_genome_rosetta_generation_upgrade_queue(queue_state, next_attempt_at, created_at)
  where queue_state in ('eligible','retry');
create index if not exists civic_genome_rosetta_generation_upgrade_queue_bill_idx
  on public.civic_genome_rosetta_generation_upgrade_queue(genome_bill_id, created_at desc);
create index if not exists civic_genome_rosetta_generation_upgrade_queue_source_idx
  on public.civic_genome_rosetta_generation_upgrade_queue(source_document_id, created_at desc);

revoke all on table public.civic_genome_rosetta_generation_upgrade_queue
  from public, anon, authenticated;

comment on table public.civic_genome_rosetta_generation_upgrade_queue is
  'Durable downstream orchestration queue for Rosetta generation upgrades. It stores exact Rosetta source identities and target generation receipts; all decomposition/replay semantics remain owned and executed by Rosetta.';

commit;
