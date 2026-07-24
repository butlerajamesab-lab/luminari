begin;

create table if not exists public.civic_genome_rosetta_source_binding (
  source_document_id bigint primary key,
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_identity_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists civic_genome_rosetta_source_binding_bill_document_uq
  on public.civic_genome_rosetta_source_binding(genome_bill_id, source_document_id);

create table if not exists public.civic_genome_trait (
  trait_id text primary key,
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  trait_class text not null check (trait_class in ('help','workflow','accountability','override','definition','actor','deadline','funding','eligibility','enforcement','right','restriction')),
  trait_key text not null,
  normalized_value jsonb not null,
  source_object_type text not null,
  source_object_id text not null,
  source_block_id text,
  extraction_run_id bigint not null,
  verification_state text not null check (verification_state in ('confirmed','tentative','human_review_required')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  engine_version text not null,
  rule_version text not null,
  content_hash text not null,
  trait_fingerprint text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists civic_genome_trait_bill_idx
  on public.civic_genome_trait(genome_bill_id, trait_class, trait_key);
create index if not exists civic_genome_trait_extraction_run_idx
  on public.civic_genome_trait(extraction_run_id);

create table if not exists public.civic_genome_assembly_run (
  assembly_run_id uuid primary key default gen_random_uuid(),
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_document_id bigint not null,
  extraction_run_id bigint not null,
  engine_version text not null,
  rule_version text not null,
  input_hash text not null,
  output_hash text not null,
  verification_state text not null check (verification_state in ('complete','partial','failed')),
  coverage_json jsonb not null default '{}'::jsonb,
  trait_count integer not null default 0,
  malformed_object_count integer not null default 0,
  run_status text not null check (run_status in ('completed','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (genome_bill_id, extraction_run_id, engine_version, rule_version, input_hash)
);

create index if not exists civic_genome_assembly_run_bill_idx
  on public.civic_genome_assembly_run(genome_bill_id, created_at desc);

commit;