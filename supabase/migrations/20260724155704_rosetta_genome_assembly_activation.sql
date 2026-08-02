-- Rosetta -> Living Civic Genome assembly activation.
-- Additive and deterministic. No Docket Room or LegiScan behavior is changed.

alter table public.civic_genome_trait
  alter column extraction_run_id type text using extraction_run_id::text;

alter table public.civic_genome_bill
  alter column rosetta_extraction_run_id type text using rosetta_extraction_run_id::text;

alter table public.civic_genome_trait
  add column if not exists source_document_id bigint,
  add column if not exists verification_state text,
  add column if not exists engine_version text,
  add column if not exists rule_version text,
  add column if not exists content_hash text;

update public.civic_genome_trait
   set verification_state = coalesce(verification_state, signal_status),
       engine_version = coalesce(engine_version, methodology_version),
       rule_version = coalesce(rule_version, methodology_version),
       content_hash = coalesce(content_hash, trait_fingerprint)
 where verification_state is null
    or engine_version is null
    or rule_version is null
    or content_hash is null;

alter table public.civic_genome_trait
  alter column verification_state set not null,
  alter column engine_version set not null,
  alter column rule_version set not null,
  alter column content_hash set not null;

create index if not exists idx_civic_genome_trait_source_document_id
  on public.civic_genome_trait(source_document_id)
  where source_document_id is not null;

create table if not exists public.civic_genome_rosetta_source_binding (
  source_document_id bigint primary key,
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_identity_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint civic_genome_rosetta_source_binding_unique unique (genome_bill_id, source_document_id)
);

create index if not exists idx_civic_genome_rosetta_binding_bill
  on public.civic_genome_rosetta_source_binding(genome_bill_id);

create table if not exists public.civic_genome_assembly_run (
  assembly_run_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_document_id bigint not null,
  extraction_run_id text not null,
  engine_version text not null,
  rule_version text not null,
  input_hash text not null,
  output_hash text not null,
  verification_state text not null,
  coverage_json jsonb not null default '{}'::jsonb,
  trait_count integer not null default 0,
  malformed_object_count integer not null default 0,
  run_status text not null,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint civic_genome_assembly_run_verification_check check (
    verification_state in ('complete', 'partial', 'failed')
  ),
  constraint civic_genome_assembly_run_status_check check (
    run_status in ('completed', 'failed')
  ),
  constraint civic_genome_assembly_run_replay_unique unique (
    genome_bill_id,
    source_document_id,
    extraction_run_id,
    engine_version,
    rule_version,
    input_hash
  )
);

create index if not exists idx_civic_genome_assembly_run_bill
  on public.civic_genome_assembly_run(genome_bill_id, created_at desc);

comment on table public.civic_genome_rosetta_source_binding is
  'Explicit one-document-to-one-Genome-bill identity binding for deterministic Rosetta assembly.';
comment on table public.civic_genome_assembly_run is
  'Replayable Rosetta-to-Genome structural DNA assembly execution record.';