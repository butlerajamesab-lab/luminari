-- Run ONLY against the disposable fixture database from the CI workflow.
-- All blocked statements must raise the quarantine's specific 55000 SQLSTATE.
CREATE OR REPLACE FUNCTION public.expect_genome_write_rejected(p_sql text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'expected quarantine rejection: %', p_sql;
EXCEPTION
  WHEN SQLSTATE '55000' THEN NULL;
END;
$fn$;

SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_trait(id) VALUES (2)');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_trait SET id=3 WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_assembly_run(id,rosetta_engine_version) VALUES (2,NULL)');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_assembly_run SET rosetta_engine_version=NULL WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_rosetta_structural_representation(id) VALUES (1)');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_rosetta_source_binding(id) VALUES (1)');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_target SET engine_version=''rosetta-rule-ref-v12'' WHERE id=1');

-- No new Rosetta payloads or run IDs even on otherwise valid Docket bill writes.
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_bill(id,structural_dna_json) VALUES (3,''{"source_bill_id":300,"rosetta_assembly":{}}'')');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_bill(id,rosetta_extraction_run_id) VALUES (3,''legacy'')');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_bill SET structural_dna_json=structural_dna_json || ''{"rosetta_assembly":{"engine":"another"}}'' WHERE id=2');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_bill SET rosetta_extraction_run_id=''another-run'' WHERE id=2');

-- Version receipt claims / terminal labels cannot grant themselves authority.
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_bill_version(id,processing_state) VALUES (4,''verified'')');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_bill_version(id,receipt_json) VALUES (4,''{"assembly_run_id":"invented"}'')');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_bill_version SET receipt_json=receipt_json || ''{"rosetta_engine_version":"v12"}'' WHERE id=2');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_bill_version SET processing_state=''assembled'' WHERE id=2');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_bill_version SET assembly_run_id=''00000000-0000-4000-8000-000000000001'' WHERE id=2');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_activation_queue SET queue_state=''running'' WHERE id=1');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_rosetta_generation_upgrade_queue SET queue_state=''completed'' WHERE id=1');

-- New sealed source-only snapshots are permitted. Old sealed history is
-- retained and cannot be changed; old payloads may never be copied forward.
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_projection_entity_version(version_id,entity_type,record_hash,record_json) VALUES (2,''bill'',''invalid-new'',''{"structural_dna_json":{"rosetta_assembly":{"engine":"old"}}}'')');
SELECT public.expect_genome_write_rejected(
  'INSERT INTO public.civic_genome_projection_entity_version(version_id,entity_type,record_hash,record_json) VALUES (2,''bill'',''invalid-new'',''{"rosetta_extraction_run_id":"old-run"}'')');
SELECT public.expect_genome_write_rejected(
  'UPDATE public.civic_genome_projection_entity_version SET record_json=''{}'' WHERE version_id=1');
INSERT INTO public.civic_genome_projection_entity_version(version_id,entity_type,record_hash,record_json)
VALUES (2,'bill','canonical-source','{"structural_dna_json":{"source_bill_id":200},"rosetta_extraction_run_id":null}');
INSERT INTO public.civic_genome_projection_entity_version(version_id,entity_type,record_hash,record_json)
VALUES (3,'family','family-source','{"family_id":"ok"}');

-- Docket source operations stay open; old derived values stay untouched
-- until physical deletion. Legitimate source hash/version updates still work.
INSERT INTO public.civic_genome_bill(id,structural_dna_json,structural_dna_hash)
VALUES (5,'{"source_bill_id":500,"source_provider":"docket"}','source-hash');
UPDATE public.civic_genome_bill
   SET structural_dna_json=structural_dna_json || '{"provider_status":"chaptered"}'
 WHERE id=2;
UPDATE public.civic_genome_bill
   SET structural_dna_json=structural_dna_json - 'rosetta_assembly',
       rosetta_extraction_run_id=NULL
 WHERE id=2;
UPDATE public.civic_genome_bill_version
   SET receipt_json=receipt_json || '{"provider_hash":"changed-source"}'
 WHERE id=2;
UPDATE public.civic_genome_bill_version
   SET receipt_json=receipt_json - 'rosetta_engine_version' - 'assembly_trait_count',
       rosetta_extraction_run_id=NULL,
       processing_state='registered'
 WHERE id=2;

-- Pending queue metadata can still be reconciled or retired.
UPDATE public.civic_genome_rosetta_generation_activation_queue SET queue_state='failed' WHERE id=1;
UPDATE public.civic_genome_rosetta_generation_upgrade_queue SET queue_state='dead_letter' WHERE id=1;

DO $verify$
BEGIN
  IF (SELECT structural_dna_json ->> 'source_bill_id' FROM public.civic_genome_bill WHERE id=2) <> '200' THEN
    RAISE EXCEPTION 'Docket identity was modified';
  END IF;
  IF (SELECT count(*) FROM public.civic_genome_projection_entity_version WHERE version_id=1 AND record_hash='legacy-snapshot-hash') <> 1 THEN
    RAISE EXCEPTION 'Sealed original snapshot was changed';
  END IF;
  IF (SELECT count(*) FROM public.civic_genome_projection_entity_version WHERE version_id=2 AND record_hash='canonical-source') <> 1 THEN
    RAISE EXCEPTION 'Source-only snapshot insertion was blocked';
  END IF;
  IF (SELECT structural_dna_json ? 'rosetta_assembly' FROM public.civic_genome_bill WHERE id=2) THEN
    RAISE EXCEPTION 'Expected old assembly key to be removable';
  END IF;
  IF NOT has_table_privilege('service_role','public.civic_genome_trait','DELETE')
    OR has_table_privilege('service_role','public.civic_genome_trait','INSERT')
    OR has_table_privilege('service_role','public.civic_genome_assembly_run','UPDATE')
    OR has_table_privilege('service_role','public.civic_genome_rosetta_generation_target','UPDATE') THEN
    RAISE EXCEPTION 'Service role permissions not sufficiently scoped';
  END IF;
  IF (SELECT count(*) FROM public.civic_genome_trait) <> 1 THEN
    RAISE EXCEPTION 'Historical traits were changed by the gate';
  END IF;
END;
$verify$;

-- The quarantine never blocks an explicitly audited physical DELETE.
DELETE FROM public.civic_genome_trait WHERE id=1;
DELETE FROM public.civic_genome_assembly_run WHERE id=1;
