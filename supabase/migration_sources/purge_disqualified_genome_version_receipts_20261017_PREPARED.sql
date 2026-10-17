-- PREPARED ONLY. Not an applied migration, not approved for production.
-- Retire obsolete engine-specific Genome bill-version interpretations WITHOUT
-- deleting a single Docket bill, source document, bill version, family, event,
-- legal source hash, full-text source provenance field or lineage edge.
--
-- Production read-only identity pins 2026-10-17:
--   9,428 old Rosetta extraction IDs, six disqualified engine identities;
--   9,428 exactly source-key-bound Docket source documents; no unmatched source;
--   9,428 related legislative queues; 20 still SUBMITTED/leased at preflight.
--   Full version-row SHA-256: 3727cfd4ac781b812c941755c1cce0a8da233945bcc2dc36f060ad06dbf17121
--   Full queue-row SHA-256: d962de134fc866b7ab6217db0c1864bc1c51666cb1e94629c5bad81d1661b49b
--
-- This SQL MUST currently refuse live execution due to 20 submitted/leased
-- queue rows. FIRST deploy + independently verify permanent conveyor retirement
-- (#743), then separately reconcile those leases without invoking an engine
-- or provider. Re-census and replace pins via independent review afterwards.
--
-- Source fields are explicitly ALLOWED, never determined by "not rosetta".
-- Two-phase status reset (terminal -> registered -> source_ingested) is essential:
-- the installed terminal trigger silently restores a direct downgrade to
-- source_ingested. No function replacement, bypass or trigger disabling allowed.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $retire_obsolete_genome_version_receipts$
DECLARE
  v_source_receipt_keys text[] := ARRAY[
    'docket_source_document_key',
    'provider_document_id', 'provider_document_type', 'provider_hash',
    'registered_at', 'source_byte_hash', 'source_content_hash',
    'source_document_id', 'source_url', 'source_version',
    'text_extractor_version',
    -- Durable SOURCE registration identity, not engine extraction output:
    'durable_source_content_contract','durable_source_content_registered_at',
    'rosetta_source_content_id','rosetta_source_identity_hash',
    -- Independent Docket operational authority/observed source provenance:
    'docket_authority_cache_fetched_at','docket_authority_detail_fetched_at',
    'docket_authority_sha256','docket_authority_observed_at',
    'docket_authority_observed_source_content_hash',
    'docket_authority_source_changed'
  ];
  -- Exactly the derivative receipt keys observed in the reviewed production
  -- 9,428-row population. NEVER infer safe deletion from a key prefix:
  -- a future rosetta_* or prism_* field may be new source authority.
  v_retired_receipt_keys text[] := ARRAY[
    'assembly_engine_version', 'assembly_input_hash', 'assembly_output_hash',
    'assembly_replayed', 'assembly_rule_version', 'assembly_run_id',
    'assembly_trait_count', 'assembly_verification_state', 'automatic_reprocess_v24',
    'automatic_reprocess_v24_completed_at', 'current_rosetta_status', 'durable_content_recovery_v1',
    'durable_source_content_replayed', 'failed_at', 'failure_class',
    'failure_code', 'family_resolution_status', 'legislative_version_recovery_contract',
    'legislative_version_recovery_previous_failure_code', 'legislative_version_recovery_previous_queue_attempt_count', 'legislative_version_recovery_previous_queue_error_code',
    'legislative_version_recovery_previous_queue_failure_class', 'legislative_version_recovery_reason', 'legislative_version_recovery_requeued_at',
    'legislative_version_recovery_target_engine_version', 'legislative_version_recovery_target_rule_manifest_hash', 'legislative_version_recovery_target_rule_set_version',
    'lighthouse_v2511_marked_reprint_handoff_previous_failure_code', 'lighthouse_v2511_marked_reprint_handoff_previous_queue_attempt_count', 'lighthouse_v2511_marked_reprint_handoff_previous_queue_error_code',
    'lighthouse_v2511_marked_reprint_handoff_previous_queue_failure_class', 'lighthouse_v2511_marked_reprint_handoff_prior_rosetta_extraction_run_id', 'lighthouse_v2511_marked_reprint_handoff_recovery_reason',
    'lighthouse_v2511_marked_reprint_handoff_requeued_at', 'lighthouse_v2511_marked_reprint_post_cutover_previous_failure_code', 'lighthouse_v2511_marked_reprint_post_cutover_previous_queue_attempt_count',
    'lighthouse_v2511_marked_reprint_post_cutover_previous_queue_error_code', 'lighthouse_v2511_marked_reprint_post_cutover_previous_queue_failure_class', 'lighthouse_v2511_marked_reprint_post_cutover_prior_rosetta_extraction_run_id',
    'lighthouse_v2511_marked_reprint_post_cutover_requeued_at', 'lighthouse_v2511_marked_reprint_post_cutover_retry_reason', 'pre_v22_current_generation',
    'prior_processing_attempts', 'prism_completed_at', 'prism_engine_version',
    'prism_expected_trait_count', 'prism_output_hash', 'prism_receipt_count',
    'prism_receipt_manifest_hash', 'prism_rosetta_stale_context_previous_assembly_run_id', 'prism_rosetta_stale_context_previous_attempt_count',
    'prism_rosetta_stale_context_previous_error_code', 'prism_rosetta_stale_context_previous_expected_trait_count', 'prism_rosetta_stale_context_previous_extraction_run_id',
    'prism_rosetta_stale_context_previous_failure_class', 'prism_rosetta_stale_context_queue_id', 'prism_rosetta_stale_context_reason',
    'prism_rosetta_stale_context_replacement_assembly_run_id', 'prism_rosetta_stale_context_replacement_extraction_run_id', 'prism_rosetta_stale_context_replacement_queue_state',
    'prism_rosetta_stale_context_replacement_trait_count', 'prism_rosetta_stale_context_superseded_at', 'prism_rosetta_stale_context_supersession_contract',
    'prism_rosetta_stale_context_sweeper_contract', 'prism_rosetta_stale_context_swept_at', 'prism_rule_set_id',
    'prism_rule_set_version', 'prism_status_counts', 'prism_verification_run_id',
    'prism_version_state', 'rosetta_configuration_hash', 'rosetta_engine_version',
    'rosetta_extraction_run_id', 'rosetta_generation_upgrade_at', 'rosetta_generation_upgrade_contract',
    'rosetta_output_content_hash', 'rosetta_replayed', 'rosetta_rule_manifest_hash',
    'rosetta_rule_set_version', 'rosetta_run_version', 'source_fallback_recovery_canary_pause_v1',
    'source_fallback_recovery_canary_v1', 'source_fallback_recovery_contract', 'source_fallback_recovery_not_before',
    'source_fallback_recovery_previous_attempt_count', 'source_fallback_recovery_previous_failure_code', 'source_fallback_recovery_previous_queue_error_code',
    'source_fallback_recovery_previous_queue_failure_class', 'source_fallback_recovery_reason', 'source_fallback_recovery_requeued_at',
    'terminal_state_reconciled_at', 'terminal_state_regression_prevented'
  ];
  v_count bigint;
  v_queue_count bigint;
  v_changed bigint;
  v_removed bigint;
  v_id_hash text;
  v_full_hash text;
  v_queue_id_hash text;
  v_queue_hash text;
  v_protected_before jsonb;
  v_protected_after jsonb;
  v_unrecognized_keys text[];
  v_trigger_match integer;
BEGIN
  IF to_regclass('public.civic_genome_bill_version') IS NULL
     OR to_regclass('public.civic_genome_legislative_version_queue') IS NULL
     OR to_regclass('public.docket_bill_source_document') IS NULL
     OR to_regclass('public.docket_bill_detail_cache') IS NULL
     OR to_regclass('public.civic_genome_bill') IS NULL
     OR to_regclass('public.civic_genome_family') IS NULL
     OR to_regclass('public.civic_genome_event') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_required_source_table_missing';
  END IF;

  -- Block queue claims and local version writers, but allow independent reads.
  LOCK TABLE public.civic_genome_legislative_version_queue,
    public.civic_genome_bill_version IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1 FROM pg_inherits
     WHERE inhrelid IN ('public.civic_genome_bill_version'::regclass,
                        'public.civic_genome_legislative_version_queue'::regclass)
        OR inhparent IN ('public.civic_genome_bill_version'::regclass,
                         'public.civic_genome_legislative_version_queue'::regclass)
  ) OR EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid IN ('public.civic_genome_bill_version'::regclass,
                    'public.civic_genome_legislative_version_queue'::regclass)
      AND c.relkind <> 'r'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_table_shape_drift';
  END IF;

  -- All existing triggers must remain ENABLED with exact audited bodies.
  -- Particularly important: terminal-state guard, Rosetta SQL writer fence,
  -- Prisma/Rosetta legacy handlers, amendment wake-up and Docket enqueuer.
  WITH expected(trigger_name, table_name, body_md5) AS (VALUES
    ('civic_genome_bill_version_enqueue_prism_v22','civic_genome_bill_version','70f8d6eeda23adedb4cc863e097874fa'),
    ('civic_genome_bill_version_lineage_guard','civic_genome_bill_version','29c2a50392a6d907af7dd081cc2370e6'),
    ('civic_genome_bill_version_prism_late_binding','civic_genome_bill_version','97dd900add40656464be6c4914101d73'),
    ('civic_genome_bill_version_terminal_state_guard','civic_genome_bill_version','dcf87cf361c4e8a4ad70ad27fab113bf'),
    ('civic_genome_guard_rosetta_generation_upgrade_version_v1','civic_genome_bill_version','b73abd0266245249ae8f1e6b143308f5'),
    ('enqueue_docket_current_authoritative_version_v1','civic_genome_bill_version','aedeefd16eac77249a25640afbdc502b'),
    ('wake_civic_genome_amendments_for_base_v1','civic_genome_bill_version','95385ac910458cab2defd38e111836b8'),
    ('zz_civic_genome_block_bill_version_rosetta_receipt_v1','civic_genome_bill_version','b29c9699c7831806f7ddcf346e309e22'),
    ('preserve_legislative_version_queue_state_v1','civic_genome_legislative_version_queue','46ff64116d60ff670ad4c723d77577b0')
  )
  SELECT count(*) INTO v_trigger_match
    FROM expected e
    JOIN pg_trigger t
      ON t.tgrelid = to_regclass('public.'||e.table_name)
     AND t.tgname = e.trigger_name
    WHERE NOT t.tgisinternal
      AND t.tgenabled='O'
      AND md5(pg_get_functiondef(t.tgfoid))=e.body_md5;

  IF v_trigger_match <> 9
     OR (SELECT count(*) FROM pg_trigger
          WHERE tgrelid='public.civic_genome_bill_version'::regclass AND NOT tgisinternal) <> 8
     OR (SELECT count(*) FROM pg_trigger
          WHERE tgrelid='public.civic_genome_legislative_version_queue'::regclass AND NOT tgisinternal) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_trigger_body_or_scope_drift';
  END IF;

  -- Exact population: every old-Rosetta run has Docket source identity and
  -- immutable source hash; no new/current engine identity is allowed here.
  CREATE TEMP TABLE retirement_version_source_manifest ON COMMIT DROP AS
    SELECT v.bill_version_id,
           v.source_document_key,
           v.receipt_json->>'source_content_hash' AS source_content_hash,
           (to_jsonb(v)-ARRAY[
             'rosetta_extraction_run_id','assembly_run_id',
             'prism_verification_run_id','processing_state','failure_code','receipt_json'
           ]) AS untouched_version_tuple,
           (SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
              FROM jsonb_each(v.receipt_json) e(key,value)
             WHERE e.key=ANY(v_source_receipt_keys)) AS source_receipt
      FROM public.civic_genome_bill_version v
     WHERE v.rosetta_extraction_run_id IS NOT NULL;

  SELECT count(*),
    encode(extensions.digest(convert_to(
      string_agg(v.bill_version_id::text,'' ORDER BY v.bill_version_id),
      'UTF8'),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      string_agg(encode(extensions.digest(convert_to(to_jsonb(v)::text,'UTF8'),'sha256'),'hex'),
                 '' ORDER BY v.bill_version_id),'UTF8'),'sha256'),'hex')
    INTO v_count,v_id_hash,v_full_hash
  FROM public.civic_genome_bill_version v
  JOIN retirement_version_source_manifest t USING(bill_version_id);

  IF v_count <> 9428
     OR v_id_hash IS DISTINCT FROM 'f8c650f609b97cd409c7faa2a3712229be59bd97a32f051086040fb3706e4724'
     OR v_full_hash IS DISTINCT FROM '3727cfd4ac781b812c941755c1cce0a8da233945bcc2dc36f060ad06dbf17121' THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_exact_row_manifest_drift';
  END IF;

  IF EXISTS (
    SELECT 1 FROM retirement_version_source_manifest t
    WHERE t.source_document_key IS NULL
       OR t.source_content_hash !~ '^[0-9a-fA-F]{64}$'
       OR NOT EXISTS(SELECT 1 FROM public.docket_bill_source_document d
                      WHERE d.source_document_key=t.source_document_key)
  ) OR EXISTS(
    SELECT 1 FROM public.civic_genome_bill_version v
     JOIN retirement_version_source_manifest t USING(bill_version_id)
    WHERE v.assembly_run_id IS NOT NULL
       OR v.prism_verification_run_id IS NOT NULL
       OR v.receipt_json->>'rosetta_engine_version' NOT IN (
          'rosetta-v3-deterministic-sql-2.2.0',
          'rosetta-v3-deterministic-sql-2.3.0',
          'rosetta-v3-deterministic-sql-2.4.0',
          'rosetta-v3-deterministic-sql-2.5.8',
          'rosetta-v3-deterministic-sql-2.5.10',
          'rosetta-v3-deterministic-sql-2.5.11'
        )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_source_or_engine_population_mismatch';
  END IF;

  -- Every receipt key must be individually classified from the exact
  -- production census: source-only (preserve) OR retired derivative (remove).
  -- A newly introduced rosetta_/assembly_/prism_ field is UNKNOWN, not
  -- automatically deletable. The entire transaction rolls back on drift.
  SELECT array_agg(DISTINCT e.key ORDER BY e.key) INTO v_unrecognized_keys
  FROM public.civic_genome_bill_version v
  JOIN retirement_version_source_manifest t USING(bill_version_id)
  CROSS JOIN LATERAL jsonb_each(v.receipt_json) e(key,value)
  WHERE NOT e.key=ANY(v_source_receipt_keys)
    AND NOT e.key=ANY(v_retired_receipt_keys);
  IF v_unrecognized_keys IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_unrecognized_receipt_fields',
      DETAIL=array_to_string(v_unrecognized_keys,',');
  END IF;

  SELECT count(*),
    encode(extensions.digest(convert_to(
      string_agg(q.queue_id::text,'' ORDER BY q.queue_id),
      'UTF8'),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      string_agg(encode(extensions.digest(convert_to(to_jsonb(q)::text,'UTF8'),'sha256'),'hex'),
                 '' ORDER BY q.queue_id),'UTF8'),'sha256'),'hex')
    INTO v_queue_count,v_queue_id_hash,v_queue_hash
  FROM public.civic_genome_legislative_version_queue q
  JOIN retirement_version_source_manifest t USING(bill_version_id);

  IF v_queue_count <> 9428
     OR v_queue_id_hash IS DISTINCT FROM '9631349f707d971600fef4f3c095f996c1a58cafb7c27df36649c0ee9b28aa58'
     OR v_queue_hash IS DISTINCT FROM 'd962de134fc866b7ab6217db0c1864bc1c51666cb1e94629c5bad81d1661b49b'
     OR EXISTS(
       SELECT 1 FROM public.civic_genome_legislative_version_queue q
       JOIN retirement_version_source_manifest t USING(bill_version_id)
       WHERE q.queue_state='submitted'
          OR q.locked_at IS NOT NULL OR q.locked_by IS NOT NULL
     ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_queue_drift_or_active_lease';
  END IF;

  -- Source and legislative identity conservation checks. Counts are checked
  -- inside the same transaction; the row-level protected version tuple is
  -- separately compared byte-for-byte (via jsonb equality).
  SELECT jsonb_build_object(
    'docket_document_count',(SELECT count(*) FROM public.docket_bill_source_document),
    'docket_detail_count',(SELECT count(*) FROM public.docket_bill_detail_cache),
    'genome_bill_count',(SELECT count(*) FROM public.civic_genome_bill),
    'genome_family_count',(SELECT count(*) FROM public.civic_genome_family),
    'genome_event_count',(SELECT count(*) FROM public.civic_genome_event),
    'version_count',(SELECT count(*) FROM public.civic_genome_bill_version)
  ) INTO v_protected_before;

  -- FIRST PASS: terminal -> registered is permitted by original guard.
  -- Clear all downstream results/claims but keep source fields exactly.
  UPDATE public.civic_genome_bill_version v
     SET processing_state='registered',
         rosetta_extraction_run_id=NULL,
         assembly_run_id=NULL,
         prism_verification_run_id=NULL,
         failure_code=NULL,
         receipt_json=t.source_receipt,
         updated_at=v.updated_at
    FROM retirement_version_source_manifest t
   WHERE v.bill_version_id=t.bill_version_id;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>9428 OR EXISTS(
    SELECT 1 FROM public.civic_genome_bill_version v
    JOIN retirement_version_source_manifest t USING(bill_version_id)
    WHERE v.processing_state <> 'registered'
       OR v.rosetta_extraction_run_id IS NOT NULL
       OR v.assembly_run_id IS NOT NULL
       OR v.prism_verification_run_id IS NOT NULL
       OR v.failure_code IS NOT NULL
       OR v.receipt_json IS DISTINCT FROM t.source_receipt
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_first_pass_rejected_or_mutated';
  END IF;

  -- SECOND PASS: registered -> source_ingested, proven only by the
  -- original exact source hash and corresponding Docket source registry.
  UPDATE public.civic_genome_bill_version v
     SET processing_state='source_ingested',
         updated_at=v.updated_at
    FROM retirement_version_source_manifest t
   WHERE v.bill_version_id=t.bill_version_id;
  GET DIAGNOSTICS v_changed=ROW_COUNT;
  IF v_changed<>9428 OR EXISTS(
    SELECT 1 FROM public.civic_genome_bill_version v
    JOIN retirement_version_source_manifest t USING(bill_version_id)
    WHERE v.processing_state <> 'source_ingested'
       OR (to_jsonb(v)-ARRAY[
         'rosetta_extraction_run_id','assembly_run_id',
         'prism_verification_run_id','processing_state','failure_code','receipt_json'
       ]) IS DISTINCT FROM t.untouched_version_tuple
       OR v.receipt_json IS DISTINCT FROM t.source_receipt
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_source_only_conservation_failed';
  END IF;

  -- Obsolete queued decomposition is retired physically; Docket SOURCE rows,
  -- bill versions and legitimate event/lineage graphs remain untouched.
  DELETE FROM public.civic_genome_legislative_version_queue q
   USING retirement_version_source_manifest t
   WHERE q.bill_version_id=t.bill_version_id;
  GET DIAGNOSTICS v_removed=ROW_COUNT;
  IF v_removed<>9428 OR EXISTS(
    SELECT 1 FROM public.civic_genome_legislative_version_queue q
    JOIN retirement_version_source_manifest t USING(bill_version_id)
  ) OR EXISTS(
    SELECT 1 FROM public.civic_genome_bill_version
     WHERE rosetta_extraction_run_id IS NOT NULL
        OR assembly_run_id IS NOT NULL
        OR prism_verification_run_id IS NOT NULL
        OR processing_state IN ('assembled','verified','verified_with_findings')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_derivative_or_queue_remained';
  END IF;

  SELECT jsonb_build_object(
    'docket_document_count',(SELECT count(*) FROM public.docket_bill_source_document),
    'docket_detail_count',(SELECT count(*) FROM public.docket_bill_detail_cache),
    'genome_bill_count',(SELECT count(*) FROM public.civic_genome_bill),
    'genome_family_count',(SELECT count(*) FROM public.civic_genome_family),
    'genome_event_count',(SELECT count(*) FROM public.civic_genome_event),
    'version_count',(SELECT count(*) FROM public.civic_genome_bill_version)
  ) INTO v_protected_after;
  IF v_protected_after IS DISTINCT FROM v_protected_before THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='genome_version_retirement_docket_lineage_or_identity_changed';
  END IF;

  RAISE NOTICE 'Prepared Genome derivative retirement: % source-only versions, % queues retired; Docket source and bill/family/event counts preserved',v_changed,v_removed;
END;
$retire_obsolete_genome_version_receipts$;

COMMIT;
