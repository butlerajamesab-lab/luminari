-- Civic Genome / Rosetta DB-level anti-recontamination fence (PREPARED ONLY).
-- Authored against the 2026-10-15 Luminari production schema. Do not execute
-- until independently reviewed, CI-tested, and entered into the migration ledger.
--
-- No data deletion, no Rosetta engine installation, no target version replacement.
-- No changes to Docket canonical source tables, intake, Atlas, signals or Viewfinder.
-- This is a temporary fail-closed hold pending independently attested V12
-- source/run/manifest/output proof and a separate reentry migration.
--
-- Key constraint: existing contaminated data may be READ for forensic removal
-- and DELETED by a later audited purge. INSERT/UPDATE of derivative rows is
-- blocked, including the legacy assembly-trigger blank-version bypass.
-- Use RESTRICT (not CASCADE) for any later legacy schema retirement.

CREATE OR REPLACE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'civic_genome_rosetta_derivative_write_quarantined',
    DETAIL = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END;
$body$;

-- z-prefix ensures the gate checks the row after other BEFORE row triggers
-- have made any modifications. This does not disable the older guards.
CREATE TRIGGER zz_civic_genome_block_rosetta_trait_write_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_trait
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1();

CREATE TRIGGER zz_civic_genome_block_rosetta_assembly_write_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_assembly_run
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1();

CREATE TRIGGER zz_civic_genome_block_rosetta_structural_representation_write_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_rosetta_structural_representation
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1();

CREATE TRIGGER zz_civic_genome_block_rosetta_source_binding_write_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_rosetta_source_binding
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1();

CREATE TRIGGER zz_civic_genome_block_rosetta_target_write_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_rosetta_generation_target
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_derivative_write_v1();

-- Service-role direct table writes are also withheld. Preserve SELECT and
-- DELETE grants: later physical purge is independently authorized and audited.
-- Do not revoke the service_role's rights on Docket source/bill/version tables.
REVOKE INSERT, UPDATE ON TABLE
  public.civic_genome_trait,
  public.civic_genome_assembly_run,
  public.civic_genome_rosetta_structural_representation,
  public.civic_genome_rosetta_source_binding,
  public.civic_genome_rosetta_generation_target
FROM service_role;

CREATE OR REPLACE FUNCTION public.civic_genome_block_bill_rosetta_payload_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rosetta_extraction_run_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_bill_rosetta_run_write_quarantined';
    END IF;
  ELSIF NEW.rosetta_extraction_run_id IS NOT NULL
    AND NEW.rosetta_extraction_run_id IS DISTINCT FROM OLD.rosetta_extraction_run_id THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='civic_genome_bill_rosetta_run_write_quarantined';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['rosetta_assembly','rosetta_source_receipt'] LOOP
    IF COALESCE(NEW.structural_dna_json,'{}'::jsonb) ? v_key THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='civic_genome_bill_rosetta_payload_write_quarantined',
          DETAIL=v_key;
      END IF;
      IF (NEW.structural_dna_json -> v_key) IS DISTINCT FROM (OLD.structural_dna_json -> v_key) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='civic_genome_bill_rosetta_payload_write_quarantined',
          DETAIL=v_key;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$body$;

-- An unchanged old Rosetta payload does not prevent Docket source refresh.
-- New/changed Rosetta payloads fail. Removing old payloads during the purge
-- remains allowed. The structural_dna_hash is also used for Docket source
-- projections, so it is not globally frozen without a provenance classifier.
CREATE TRIGGER zz_civic_genome_block_bill_rosetta_payload_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_bill
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_bill_rosetta_payload_v1();

CREATE OR REPLACE FUNCTION public.civic_genome_block_bill_version_rosetta_receipt_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.rosetta_extraction_run_id IS NOT NULL OR NEW.assembly_run_id IS NOT NULL
      OR NEW.processing_state IN ('assembled','verified','verified_with_findings') THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_bill_version_rosetta_assembly_write_quarantined';
    END IF;
  ELSE
    IF (NEW.rosetta_extraction_run_id IS NOT NULL
        AND NEW.rosetta_extraction_run_id IS DISTINCT FROM OLD.rosetta_extraction_run_id)
      OR (NEW.assembly_run_id IS NOT NULL AND NEW.assembly_run_id IS DISTINCT FROM OLD.assembly_run_id)
      OR (NEW.processing_state IN ('assembled','verified','verified_with_findings')
        AND NEW.processing_state IS DISTINCT FROM OLD.processing_state) THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_bill_version_rosetta_assembly_write_quarantined';
    END IF;
  END IF;

  -- Preserve provider_document_id, source_content_hash, source_byte_hash,
  -- docket_authority_* and other raw evidence fields. Reject newly introduced
  -- or modified derivative receipts; allow their removal during cleanup.
  FOR v_key IN
    SELECT key
      FROM jsonb_object_keys(COALESCE(NEW.receipt_json,'{}'::jsonb)) AS receipt_keys(key)
     WHERE key ~ '^(rosetta_|assembly_|prism_)'
        OR key IN ('current_rosetta_status','family_resolution_status')
  LOOP
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_bill_version_derivative_receipt_quarantined',
        DETAIL=v_key;
    END IF;
    IF (NEW.receipt_json -> v_key) IS DISTINCT FROM (OLD.receipt_json -> v_key) THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_bill_version_derivative_receipt_quarantined',
        DETAIL=v_key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER zz_civic_genome_block_bill_version_rosetta_receipt_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_bill_version
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_bill_version_rosetta_receipt_v1();

-- Queue admission is allowed for source bookkeeping but no old work may
-- transition to running/completed. Fencing the actual derivative writes above
-- remains authoritative if a queue is manipulated by another caller.
CREATE OR REPLACE FUNCTION public.civic_genome_block_rosetta_queue_execution_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.queue_state IN ('running','completed') THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_rosetta_queue_execution_quarantined',
        DETAIL=TG_TABLE_NAME;
    END IF;
  ELSIF NEW.queue_state IN ('running','completed')
      AND NEW.queue_state IS DISTINCT FROM OLD.queue_state THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='civic_genome_rosetta_queue_execution_quarantined',
      DETAIL=TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER zz_civic_genome_block_rosetta_activation_execution_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_rosetta_generation_activation_queue
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_queue_execution_v1();

CREATE TRIGGER zz_civic_genome_block_rosetta_upgrade_execution_v1
BEFORE INSERT OR UPDATE ON public.civic_genome_rosetta_generation_upgrade_queue
FOR EACH ROW EXECUTE FUNCTION public.civic_genome_block_rosetta_queue_execution_v1();
