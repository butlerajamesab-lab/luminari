-- PREPARED ONLY; NOT an applied migration or authorization to modify production.
-- Follow-on to the already-applied 20261015135444 Civic Genome SQL quarantine.
-- Corrects P1 reviewed in Luminari PRs #722 and #723: activation claims
-- transition into "submitted", whereas the shared quarantine only rejected
-- "running" and "completed".
--
-- This replaces ONLY the pre-existing shared queue trigger function.
-- Never changes Docket source, Rosetta engines, Atlas signals, Viewfinder,
-- user intake, grants, queue rows, or historical ledger records.
BEGIN;

DO $preflight$
DECLARE
  v_function_definition text;
  v_trigger_count integer;
BEGIN
  IF to_regprocedure('public.civic_genome_block_rosetta_queue_execution_v1()') IS NULL
     OR to_regclass('public.civic_genome_rosetta_generation_activation_queue') IS NULL
     OR to_regclass('public.civic_genome_rosetta_generation_upgrade_queue') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_activation_fence_expected_objects_missing';
  END IF;
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgname IN ('zz_civic_genome_block_rosetta_activation_execution_v1',
                   'zz_civic_genome_block_rosetta_upgrade_execution_v1')
    AND tgenabled='O' AND NOT tgisinternal
    AND tgfoid='public.civic_genome_block_rosetta_queue_execution_v1()'::regprocedure;
  IF v_trigger_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_activation_fence_trigger_inventory_drift',
      DETAIL=v_trigger_count::text;
  END IF;
  v_function_definition:=pg_get_functiondef(
    'public.civic_genome_block_rosetta_queue_execution_v1()'::regprocedure
  );
  IF position('''running'',''completed''' in replace(v_function_definition,' ','')) = 0
     OR position('''submitted''' in v_function_definition) > 0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_activation_fence_expected_original_body_changed';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.civic_genome_block_rosetta_queue_execution_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $body$
BEGIN
  IF TG_OP NOT IN ('INSERT','UPDATE') THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='civic_genome_rosetta_queue_unrecognized_operation',
      DETAIL=TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'civic_genome_rosetta_generation_activation_queue' THEN
    -- submitted is the actual claimed/executing state, including lease reclaims.
    -- Block even submitted -> submitted updates, which can reassign a lease.
    IF NEW.queue_state IN ('submitted','running','completed') THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_rosetta_queue_execution_quarantined',
        DETAIL=TG_TABLE_NAME;
    END IF;
  ELSIF TG_TABLE_NAME = 'civic_genome_rosetta_generation_upgrade_queue' THEN
    IF NEW.queue_state IN ('running','completed') THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='civic_genome_rosetta_queue_execution_quarantined',
        DETAIL=TG_TABLE_NAME;
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='civic_genome_rosetta_queue_unrecognized_table',
      DETAIL=TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$body$;

DO $postflight$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_trigger
  WHERE tgname IN ('zz_civic_genome_block_rosetta_activation_execution_v1',
                   'zz_civic_genome_block_rosetta_upgrade_execution_v1')
    AND tgenabled='O' AND NOT tgisinternal
    AND tgfoid='public.civic_genome_block_rosetta_queue_execution_v1()'::regprocedure;
  IF v_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_activation_fence_postflight_trigger_inventory_changed';
  END IF;
END;
$postflight$;
COMMIT;
