begin;

create table if not exists public.civic_genome_rosetta_structural_representation (
  assembly_run_id uuid not null references public.civic_genome_assembly_run(assembly_run_id) on delete cascade,
  genome_bill_id uuid not null references public.civic_genome_bill(genome_bill_id) on delete cascade,
  source_document_id bigint not null,
  extraction_run_id text not null,
  representation_key text not null,
  representation_type text not null,
  normalized_value_json jsonb not null,
  source_object_type text not null,
  source_object_id text not null,
  source_block_id text not null,
  confidence_score numeric not null check (confidence_score >= 0 and confidence_score <= 1),
  signal_status text not null,
  source_span jsonb not null,
  source_trace jsonb not null,
  rosetta_engine_version text not null,
  rosetta_rule_set_version text not null,
  rosetta_rule_manifest_hash text not null,
  rosetta_configuration_hash text not null,
  rosetta_source_identity_hash text not null,
  rosetta_source_content_hash text not null,
  rosetta_output_content_hash text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  primary key (assembly_run_id, representation_key),
  unique (assembly_run_id, source_object_id)
);

create index if not exists civic_genome_rosetta_structural_representation_bill_idx
  on public.civic_genome_rosetta_structural_representation(genome_bill_id, created_at desc);
create index if not exists civic_genome_rosetta_structural_representation_source_idx
  on public.civic_genome_rosetta_structural_representation(source_document_id, extraction_run_id);

alter table public.civic_genome_rosetta_structural_representation enable row level security;
revoke all on public.civic_genome_rosetta_structural_representation from public, anon, authenticated;
grant select, insert, update, delete on public.civic_genome_rosetta_structural_representation to service_role;

comment on table public.civic_genome_rosetta_structural_representation is
  'Exact non-operative structural evidence received from the Rosetta handoff. Rows are persisted for provenance and inspection only and are never Civic Genome semantic traits.';

commit;
