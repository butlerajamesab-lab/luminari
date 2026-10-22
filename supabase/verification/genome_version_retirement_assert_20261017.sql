-- DISPOSABLE POSTGRESQL ONLY, after fixture-specific guarded cleanup.
DO $verify_source_only$
BEGIN
  IF (SELECT count(*) FROM public.civic_genome_bill_version) <> 6
     OR (SELECT count(*) FROM public.docket_bill_source_document) <> 6
     OR (SELECT count(*) FROM public.docket_bill_detail_cache) <> 6
     OR (SELECT count(*) FROM public.civic_genome_bill) <> 1
     OR (SELECT count(*) FROM public.civic_genome_family) <> 1
     OR (SELECT count(*) FROM public.civic_genome_event) <> 1
     OR EXISTS(SELECT 1 FROM public.civic_genome_legislative_version_queue) THEN
    RAISE EXCEPTION 'source/bill/family/event changed or old queue survived';
  END IF;
  IF (SELECT count(*) FROM public.civic_genome_bill_version
      WHERE processing_state='source_ingested'
        AND rosetta_source_document_id IS NOT NULL
        AND rosetta_extraction_run_id IS NULL
        AND assembly_run_id IS NULL
        AND prism_verification_run_id IS NULL
        AND failure_code IS NULL
        AND receipt_json->>'source_content_hash'=repeat('b',64)
        AND receipt_json->>'source_byte_hash'=repeat('a',64)
        AND receipt_json->>'rosetta_source_identity_hash'=repeat('d',64)
        AND receipt_json->>'docket_authority_sha256'=repeat('e',64)
        AND receipt_json->>'provider_hash'=repeat('f',32)
        AND updated_at = '2026-08-01T00:00:00Z'::timestamptz
        AND NOT (receipt_json ?| ARRAY[
          'rosetta_engine_version','rosetta_extraction_run_id',
          'assembly_input_hash','assembly_run_id','assembly_trait_count',
          'prism_output_hash','family_resolution_status',
          'source_fallback_recovery_reason','terminal_state_regression_prevented'
        ])) <> 6 THEN
    RAISE EXCEPTION 'source-only receipt preservation failed';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.civic_genome_bill_version v
    WHERE NOT EXISTS(SELECT 1 FROM public.docket_bill_source_document d
                     WHERE d.source_document_key=v.source_document_key
                       AND d.source_bill_id=v.source_bill_id)
  ) THEN
    RAISE EXCEPTION 'Docket source identity unbound';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
      AND tgrelid='public.civic_genome_bill_version'::regclass) <> 8 THEN
    RAISE EXCEPTION 'retirement disabled or removed production-shaped triggers';
  END IF;
END;
$verify_source_only$;
