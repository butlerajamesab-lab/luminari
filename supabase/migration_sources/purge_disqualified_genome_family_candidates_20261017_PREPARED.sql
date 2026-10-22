-- PREPARED ONLY. NOT APPLIED OR REGISTERED IN ANY PRODUCTION MIGRATION LEDGER.
-- Physical retirement of one explicitly disqualified DERIVED family candidate
-- generation. Preserve source/Docket evidence, bill/family identities, events
-- and valid temporal history. No engine promotion, replay, adapter or fallback.
--
-- Production read-only census, 2026-10-17:
--   8,713 unresolved candidates, ALL methodology weighted-confirmed-traits-v2
--   8,567 similarity score candidates, 0 resolved
--   0 incoming foreign keys, 0 user-defined triggers
--   complete ordered source row SHA-256:
--     fbe7f0a79fcf4bbd8399d1c241b595e6d13e39b4da327406cc30be61b2a69e77
--
-- This prepared candidate must be independently reviewed, run in disposable
-- PostgreSQL and re-censused against production BEFORE a new governed migration.
-- No source receipt or historical Rosetta interpretation is kept as live input.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $retire_legacy_trait_family_candidates$
DECLARE
  v_count bigint;
  v_retired bigint;
  v_full_hash text;
  v_id_hash text;
  v_deleted_hash text;
  v_docket_bills bigint;
  v_docket_documents bigint;
  v_genome_bills bigint;
  v_families bigint;
  v_events bigint;
BEGIN
  IF to_regclass('public.civic_genome_unresolved_family_candidate') IS NULL
     OR to_regclass('public.docket_bill_detail_cache') IS NULL
     OR to_regclass('public.docket_bill_source_document') IS NULL
     OR to_regclass('public.civic_genome_bill') IS NULL
     OR to_regclass('public.civic_genome_family') IS NULL
     OR to_regclass('public.civic_genome_event') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_expected_source_missing';
  END IF;

  -- Lock only the derivative target. Docket, families and bill identities are
  -- checked but never locked for bulk deletion or written.
  LOCK TABLE public.civic_genome_unresolved_family_candidate IN ACCESS EXCLUSIVE MODE;

  IF (SELECT relkind FROM pg_class
       WHERE oid='public.civic_genome_unresolved_family_candidate'::regclass) <> 'r'
     OR EXISTS(
       SELECT 1 FROM pg_inherits
        WHERE inhrelid='public.civic_genome_unresolved_family_candidate'::regclass
           OR inhparent='public.civic_genome_unresolved_family_candidate'::regclass
     ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_table_shape_drift';
  END IF;

  -- Any added trigger, referential dependency or unexpected methodology needs
  -- independent analysis. Never use CASCADE or disable triggers.
  IF EXISTS(
    SELECT 1 FROM pg_trigger
     WHERE tgrelid='public.civic_genome_unresolved_family_candidate'::regclass
       AND NOT tgisinternal
  ) OR EXISTS(
    SELECT 1 FROM pg_constraint
     WHERE contype='f'
       AND confrelid='public.civic_genome_unresolved_family_candidate'::regclass
  ) OR EXISTS(
    SELECT 1 FROM public.civic_genome_unresolved_family_candidate
     WHERE methodology_version IS DISTINCT FROM 'weighted-confirmed-traits-v2'
        OR resolved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_dependency_or_method_drift';
  END IF;

  SELECT count(*),
    encode(extensions.digest(convert_to(
      string_agg(unresolved_candidate_id::text,'' ORDER BY unresolved_candidate_id),
      'UTF8'),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      string_agg(
        encode(extensions.digest(convert_to(to_jsonb(c)::text,'UTF8'),'sha256'),'hex'),
        '' ORDER BY unresolved_candidate_id
      ),'UTF8'),'sha256'),'hex')
    INTO v_count,v_id_hash,v_full_hash
    FROM public.civic_genome_unresolved_family_candidate c
    WHERE methodology_version='weighted-confirmed-traits-v2';

  IF v_count <> 8713
     OR v_id_hash IS DISTINCT FROM '200aa0159005c2900021593119c08cfb6ccd2489ab0f227bcaa03ff1bc659784'
     OR v_full_hash IS DISTINCT FROM 'fbe7f0a79fcf4bbd8399d1c241b595e6d13e39b4da327406cc30be61b2a69e77'
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_exact_manifest_drift';
  END IF;

  SELECT count(*) INTO v_docket_bills FROM public.docket_bill_detail_cache;
  SELECT count(*) INTO v_docket_documents FROM public.docket_bill_source_document;
  SELECT count(*) INTO v_genome_bills FROM public.civic_genome_bill;
  SELECT count(*) INTO v_families FROM public.civic_genome_family;
  SELECT count(*) INTO v_events FROM public.civic_genome_event;

  -- The deleted rows themselves must match the exact approved original set.
  WITH retired AS (
    DELETE FROM public.civic_genome_unresolved_family_candidate c
     WHERE methodology_version='weighted-confirmed-traits-v2'
     RETURNING c.*
  )
  SELECT count(*),
    encode(extensions.digest(convert_to(
      string_agg(
        encode(extensions.digest(convert_to(to_jsonb(r)::text,'UTF8'),'sha256'),'hex'),
        '' ORDER BY unresolved_candidate_id
      ),'UTF8'),'sha256'),'hex')
    INTO v_retired,v_deleted_hash
  FROM retired r;

  IF v_retired <> 8713 OR v_deleted_hash IS DISTINCT FROM v_full_hash
     OR EXISTS(SELECT 1 FROM public.civic_genome_unresolved_family_candidate)
  THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_delete_identity_mismatch';
  END IF;

  IF (SELECT count(*) FROM public.docket_bill_detail_cache) <> v_docket_bills
     OR (SELECT count(*) FROM public.docket_bill_source_document) <> v_docket_documents
     OR (SELECT count(*) FROM public.civic_genome_bill) <> v_genome_bills
     OR (SELECT count(*) FROM public.civic_genome_family) <> v_families
     OR (SELECT count(*) FROM public.civic_genome_event) <> v_events THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='genome_family_retirement_source_identity_conservation_failed';
  END IF;

  RAISE NOTICE 'PREPARED genus cleanup: retired %, SHA-256 %, source and bill/family counts conserved',
    v_retired,v_deleted_hash;
END;
$retire_legacy_trait_family_candidates$;
COMMIT;
