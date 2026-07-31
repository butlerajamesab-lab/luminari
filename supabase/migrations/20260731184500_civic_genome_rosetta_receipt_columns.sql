begin;

alter table public.civic_genome_rosetta_source_binding
  add column if not exists source_content_hash text,
  add column if not exists source_url text,
  add column if not exists source_version text,
  add column if not exists rosetta_engine_version text,
  add column if not exists rosetta_rule_set_version text,
  add column if not exists rosetta_rule_manifest_hash text,
  add column if not exists rosetta_configuration_hash text,
  add column if not exists rosetta_output_content_hash text;

alter table public.civic_genome_assembly_run
  add column if not exists rosetta_engine_version text,
  add column if not exists rosetta_rule_set_version text,
  add column if not exists rosetta_rule_manifest_hash text,
  add column if not exists rosetta_configuration_hash text,
  add column if not exists rosetta_source_identity_hash text,
  add column if not exists rosetta_source_content_hash text,
  add column if not exists rosetta_output_content_hash text,
  add column if not exists rosetta_source_url text,
  add column if not exists rosetta_source_version text;

alter table public.civic_genome_rosetta_source_binding
  drop constraint if exists civic_genome_rosetta_source_binding_source_content_hash_format;
alter table public.civic_genome_rosetta_source_binding
  add constraint civic_genome_rosetta_source_binding_source_content_hash_format
  check (source_content_hash is null or source_content_hash ~ '^[0-9a-f]{64}$');

alter table public.civic_genome_rosetta_source_binding
  drop constraint if exists civic_genome_rosetta_source_binding_rule_manifest_hash_format;
alter table public.civic_genome_rosetta_source_binding
  add constraint civic_genome_rosetta_source_binding_rule_manifest_hash_format
  check (rosetta_rule_manifest_hash is null or rosetta_rule_manifest_hash ~ '^[0-9a-f]{64}$');

alter table public.civic_genome_rosetta_source_binding
  drop constraint if exists civic_genome_rosetta_source_binding_output_hash_format;
alter table public.civic_genome_rosetta_source_binding
  add constraint civic_genome_rosetta_source_binding_output_hash_format
  check (rosetta_output_content_hash is null or rosetta_output_content_hash ~ '^[0-9a-f]{64}$');

alter table public.civic_genome_assembly_run
  drop constraint if exists civic_genome_assembly_run_rosetta_hashes_format;
alter table public.civic_genome_assembly_run
  add constraint civic_genome_assembly_run_rosetta_hashes_format
  check (
    (rosetta_rule_manifest_hash is null or rosetta_rule_manifest_hash ~ '^[0-9a-f]{64}$')
    and (rosetta_configuration_hash is null or rosetta_configuration_hash ~ '^[0-9a-f]{64}$')
    and (rosetta_source_identity_hash is null or rosetta_source_identity_hash ~ '^[0-9a-f]{64}$')
    and (rosetta_source_content_hash is null or rosetta_source_content_hash ~ '^[0-9a-f]{64}$')
    and (rosetta_output_content_hash is null or rosetta_output_content_hash ~ '^[0-9a-f]{64}$')
  );

comment on column public.civic_genome_rosetta_source_binding.source_identity_hash is
  'Exact Rosetta source identity receipt, not a Lighthouse-derived surrogate.';
comment on column public.civic_genome_trait.source_trace is
  'Per-trait provenance including Rosetta source span, run, engine, rule manifest, and content receipts.';

commit;
