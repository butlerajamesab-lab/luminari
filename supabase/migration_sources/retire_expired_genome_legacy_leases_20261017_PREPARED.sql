-- PREPARED ONLY — NOT APPLIED. No production mutation authorized by this file.
-- Retires 20 *expired* leases owned by old Rosetta version-processing jobs.
-- These are NOT current Docket source records or current selected-engine runs.
--
-- Read-only live check 2026-10-17:
--  15 submitted, 5 eligible+locked; all locked on 2026-08-07,
--  last modified no later than 2026-08-18; 0 within 60-minute lease.
--  Original ordered queue IDs sha256:
--    626cf86abbc3a943296e51b526460a1df477e2b3179baf00293e045a927bb5bc
--  Original ordered complete queue rows sha256:
--    8207cef1e0bff726c4f8f5985bb086a456546efb85de5577f19c4c1c7fd6e561
--
-- Prerequisite OUTSIDE SQL: permanent old-conveyor retirement deployed, live
-- Render worker no longer running, and no in-flight old jobs. A stale lock is
-- evidence of age, NOT evidence the process is stopped. Independently verify.
-- After this cut, version/queue SHA pins in subsequent prepared #744 MUST be
-- recaptured from the unchanged intended population before execution.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $retire_expired_legacy_genome_leases$
DECLARE
  v_count bigint;
  v_changed bigint;
  v_ids_hash text;
  v_rows_hash text;
  v_trigger_hash text;
  v_ineligible bigint;
  v_protected_before jsonb;
  v_protected_after jsonb;
BEGIN
  IF to_regclass('public.civic_genome_legislative_version_queue') IS NULL
    OR to_regclass('public.civic_genome_bill_version') IS NULL
    OR to_regclass('public.docket_bill_source_document') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_expected_tables_missing';
  END IF;
  LOCK TABLE public.civic_genome_legislative_version_queue,
             public.civic_genome_bill_version IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='public.civic_genome_legislative_version_queue'::regclass
        AND NOT tgisinternal) <> 1
    OR NOT EXISTS(
       SELECT 1 FROM pg_trigger t
       WHERE t.tgrelid='public.civic_genome_legislative_version_queue'::regclass
         AND t.tgname='preserve_legislative_version_queue_state_v1'
         AND t.tgenabled='O'
         AND md5(pg_get_functiondef(t.tgfoid))='46ff64116d60ff670ad4c723d77577b0'
    ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_queue_guard_drift';
  END IF;

  -- The exact lease population must still belong to retired engines.
  -- No lease can have been newly touched, renewed or published.
  CREATE TEMP TABLE genome_expired_legacy_lease_scope ON COMMIT DROP AS
    SELECT q.queue_id,
           q.bill_version_id,
           to_jsonb(q) - ARRAY[
             'queue_state','next_attempt_at','locked_at','locked_by',
             'last_failure_class','last_error_code','updated_at'
           ] AS immutable_queue_columns
    FROM public.civic_genome_legislative_version_queue q
    JOIN public.civic_genome_bill_version v ON v.bill_version_id=q.bill_version_id
    WHERE v.rosetta_extraction_run_id IS NOT NULL
      AND (q.queue_state='submitted' OR q.locked_at IS NOT NULL OR q.locked_by IS NOT NULL);

  SELECT count(*),
     encode(extensions.digest(convert_to(
       string_agg(q.queue_id::text,'' ORDER BY q.queue_id),'UTF8'),'sha256'),'hex'),
     encode(extensions.digest(convert_to(
       string_agg(encode(extensions.digest(convert_to(to_jsonb(q)::text,'UTF8'),'sha256'),'hex'),
                  '' ORDER BY q.queue_id),'UTF8'),'sha256'),'hex')
  INTO v_count,v_ids_hash,v_rows_hash
  FROM public.civic_genome_legislative_version_queue q
  JOIN genome_expired_legacy_lease_scope s USING(queue_id);

  IF v_count<>20
     OR v_ids_hash IS DISTINCT FROM '626cf86abbc3a943296e51b526460a1df477e2b3179baf00293e045a927bb5bc'
     OR v_rows_hash IS DISTINCT FROM '8207cef1e0bff726c4f8f5985bb086a456546efb85de5577f19c4c1c7fd6e561' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_exact_manifest_drift';
  END IF;

  IF (SELECT count(*) FROM public.civic_genome_legislative_version_queue q
      JOIN genome_expired_legacy_lease_scope s USING(queue_id)
      WHERE q.queue_state='submitted')<>15
    OR (SELECT count(*) FROM public.civic_genome_legislative_version_queue q
      JOIN genome_expired_legacy_lease_scope s USING(queue_id)
      WHERE q.queue_state='eligible')<>5
    OR EXISTS(
      SELECT 1 FROM public.civic_genome_legislative_version_queue q
      JOIN genome_expired_legacy_lease_scope s USING(queue_id)
      JOIN public.civic_genome_bill_version v
        ON v.bill_version_id=q.bill_version_id
       AND v.bill_version_id=s.bill_version_id
      WHERE q.locked_at IS NULL
         OR q.locked_by IS NULL
         OR q.locked_at>=now()-interval '14 days'
         OR q.updated_at>=now()-interval '14 days'
         OR q.queue_state NOT IN ('submitted','eligible')
         OR v.receipt_json->>'rosetta_engine_version' NOT IN (
           'rosetta-v3-deterministic-sql-2.2.0',
           'rosetta-v3-deterministic-sql-2.3.0',
           'rosetta-v3-deterministic-sql-2.4.0',
           'rosetta-v3-deterministic-sql-2.5.8',
           'rosetta-v3-deterministic-sql-2.5.10',
           'rosetta-v3-deterministic-sql-2.5.11')
    ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_recent_or_out_of_scope_claim';
  END IF;

  SELECT jsonb_build_object(
     'source_rows',(SELECT count(*) FROM public.docket_bill_source_document),
     'version_rows',(SELECT count(*) FROM public.civic_genome_bill_version),
     'queue_rows',(SELECT count(*) FROM public.civic_genome_legislative_version_queue)
  ) INTO v_protected_before;

  -- Never restore eligible; this is a terminal retiring of stale old work,
  -- not a live result, retry, fallback, or new engine attempt.
  UPDATE public.civic_genome_legislative_version_queue q
     SET queue_state='permanent_failure',
         next_attempt_at='infinity'::timestamptz,
         locked_at=NULL,
         locked_by=NULL,
         last_failure_class='retired_legacy_generation',
         last_error_code='legacy_conveyor_retired_no_replay',
         updated_at=now()
    FROM genome_expired_legacy_lease_scope s
   WHERE q.queue_id=s.queue_id;
  GET DIAGNOSTICS v_changed=ROW_COUNT;

  IF v_changed<>20 OR EXISTS(
      SELECT 1 FROM public.civic_genome_legislative_version_queue q
      JOIN genome_expired_legacy_lease_scope s USING(queue_id)
      WHERE q.queue_state<>'permanent_failure'
         OR q.next_attempt_at IS DISTINCT FROM 'infinity'::timestamptz
         OR q.locked_at IS NOT NULL
         OR q.locked_by IS NOT NULL
         OR q.last_failure_class<>'retired_legacy_generation'
         OR q.last_error_code<>'legacy_conveyor_retired_no_replay'
         OR (to_jsonb(q)-ARRAY[
            'queue_state','next_attempt_at','locked_at','locked_by',
            'last_failure_class','last_error_code','updated_at'
          ]) IS DISTINCT FROM s.immutable_queue_columns
    ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_conservation_or_terminal_state_failed';
  END IF;

  SELECT jsonb_build_object(
     'source_rows',(SELECT count(*) FROM public.docket_bill_source_document),
     'version_rows',(SELECT count(*) FROM public.civic_genome_bill_version),
     'queue_rows',(SELECT count(*) FROM public.civic_genome_legislative_version_queue)
  ) INTO v_protected_after;
  IF v_protected_after IS DISTINCT FROM v_protected_before THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='genome_lease_retirement_modified_source_or_identity_counts';
  END IF;

  RAISE NOTICE 'Prepared legacy lease retirement: 20 old queues rendered ineligible and unlocked; zero source/version rows modified';
END;$retire_expired_legacy_genome_leases$;

COMMIT;
