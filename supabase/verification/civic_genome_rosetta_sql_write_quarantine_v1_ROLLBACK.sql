-- Explicit bounded ROLLBACK for SQL write quarantine v1.
-- DO NOT run unless reverting the named quarantine migration.
-- Live preflight 2026-10-15 confirms service_role held INSERT/UPDATE before
-- quarantine on all five derived tables. No source, bill, version, or
-- projection historical data is modified by this rollback.
-- This rollback RESTORES old write authority; recontamination risk returns.
BEGIN;

DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_trait_write_v1 ON public.civic_genome_trait;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_assembly_write_v1 ON public.civic_genome_assembly_run;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_structural_representation_write_v1 ON public.civic_genome_rosetta_structural_representation;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_source_binding_write_v1 ON public.civic_genome_rosetta_source_binding;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_target_write_v1 ON public.civic_genome_rosetta_generation_target;
DROP TRIGGER IF EXISTS zz_civic_genome_block_bill_rosetta_payload_v1 ON public.civic_genome_bill;
DROP TRIGGER IF EXISTS zz_civic_genome_block_bill_version_rosetta_receipt_v1 ON public.civic_genome_bill_version;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_activation_execution_v1 ON public.civic_genome_rosetta_generation_activation_queue;
DROP TRIGGER IF EXISTS zz_civic_genome_block_rosetta_upgrade_execution_v1 ON public.civic_genome_rosetta_generation_upgrade_queue;
DROP TRIGGER IF EXISTS zz_civic_genome_guard_source_only_history_v1 ON public.civic_genome_projection_entity_version;

DROP FUNCTION public.civic_genome_block_rosetta_derivative_write_v1() RESTRICT;
DROP FUNCTION public.civic_genome_block_bill_rosetta_payload_v1() RESTRICT;
DROP FUNCTION public.civic_genome_block_bill_version_rosetta_receipt_v1() RESTRICT;
DROP FUNCTION public.civic_genome_block_rosetta_queue_execution_v1() RESTRICT;
DROP FUNCTION public.civic_genome_guard_source_only_history_v1() RESTRICT;

GRANT INSERT, UPDATE ON TABLE
  public.civic_genome_trait,
  public.civic_genome_assembly_run,
  public.civic_genome_rosetta_structural_representation,
  public.civic_genome_rosetta_source_binding,
  public.civic_genome_rosetta_generation_target
TO service_role;

COMMIT;
