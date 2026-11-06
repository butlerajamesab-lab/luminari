-- DISPOSABLE POSTGRES ONLY. Runs AFTER source-bound proposal in a
-- full-replay schema seeded with the exact synthetic production-sized cohort.
\set ON_ERROR_STOP on
SET statement_timeout='180s';

DO $post_delete$
DECLARE
  u integer;uv integer;b integer;bv integer;rr integer;ri integer;
  q integer;o integer;not_valid integer;raw_count integer;
BEGIN
 SELECT count(*) INTO u FROM public.docket_bill_source_document
   WHERE document_family='amendment' AND base_source_document_key IS NULL;
 SELECT count(*) INTO uv FROM public.civic_genome_bill_version
   WHERE document_family='amendment' AND base_bill_version_id IS NULL;
 SELECT count(*) INTO b FROM public.docket_bill_source_document
   WHERE document_family='amendment' AND base_source_document_key IS NOT NULL;
 SELECT count(*) INTO bv FROM public.civic_genome_bill_version
   WHERE document_family='amendment' AND base_bill_version_id IS NOT NULL;
 SELECT count(*) INTO rr FROM public.docket_unbased_amendment_removal_receipt_v1;
 SELECT count(*) INTO ri FROM public.docket_unbased_amendment_removal_receipt_v1
    WHERE rosetta_source_document_id IS NOT NULL;
 SELECT count(*) INTO q FROM public.civic_genome_legislative_version_queue x
   JOIN public.civic_genome_bill_version v USING(bill_version_id)
   WHERE v.document_family='amendment';
 SELECT count(*) INTO o FROM public.docket_bill_source_document_observation
   WHERE source_document_key LIKE 'amendment:1900000000:2%';
 SELECT count(*) INTO not_valid FROM pg_constraint
   WHERE conrelid='public.docket_bill_source_document'::regclass
     AND conname='docket_amendment_requires_attached_text_base_v1'
     AND NOT convalidated;
 SELECT count(*) INTO raw_count FROM public.docket_bill_detail_cache
   WHERE bill_id=1900000000
     AND source='legiscan_bulk_json'
     AND bill->>'fixture_original_legislative_source'='true';

 IF u<>0 OR uv<>0 OR b<>2101 OR bv<>2101
    OR rr<>7264 OR ri<>3783 OR q<>0 OR o<>0
    OR not_valid<>0 OR raw_count<>1
 THEN
    RAISE EXCEPTION 'Bad populated cleanup: u %, uv %, b %, bv %, receipts %, ids %, queues %, obs %, invalid_ddl %, raw %',
    u,uv,b,bv,rr,ri,q,o,not_valid,raw_count;
 END IF;
 IF to_regprocedure('public.guard_docket_amendment_source_attachment_v1()') IS NULL
  THEN RAISE EXCEPTION 'Direct amendment write guard missing';
 END IF;
 RAISE NOTICE 'PASS: 7264 deleted; dependent 4942 queues and 7438 observations gone; 2101 historical pointers retained; 3783 cross-service IDs recorded';
END
$post_delete$;

-- NEGATIVE: orphan without a base cannot enter even by direct SQL.
DO $negative_no_base$
BEGIN
 BEGIN
   INSERT INTO public.docket_bill_source_document
   (source_document_key,source_bill_id,provider_document_id,document_family,
    provider_document_type,normalized_version_type,provider_sequence,
    stage_rank,source_url,latest_observed_at)
   VALUES ('amendment:1900000000:3000001',1900000000,3000001,
           'amendment','House Amendment','house_amendment',1,250,
           'https://example.invalid/no-base',now());
   RAISE EXCEPTION 'FAIL: unbased direct amendment inserted';
 EXCEPTION WHEN check_violation THEN
   RAISE NOTICE 'PASS: unbased direct insert blocked';
 END;
END
$negative_no_base$;

-- NEGATIVE: same-bill text FK alone is not source-stated attachment evidence.
DO $negative_guess$
BEGIN
 BEGIN
   INSERT INTO public.docket_bill_source_document
   (source_document_key,source_bill_id,provider_document_id,document_family,
    provider_document_type,normalized_version_type,provider_sequence,
    stage_rank,source_url,base_source_document_key,latest_observed_at)
   VALUES ('amendment:1900000000:3000002',1900000000,3000002,
           'amendment','House Amendment','house_amendment',2,250,
           'https://example.invalid/guessed-base',
           'text:1900000000:9000000',now());
   RAISE EXCEPTION 'FAIL: unproven nonnull base accepted';
 EXCEPTION WHEN check_violation THEN
   RAISE NOTICE 'PASS: guessed base blocked without attachment evidence';
 END;
END
$negative_guess$;

-- NEGATIVE: explicit-looking proof cannot refer to a base in another bill.
DO $negative_cross_bill$
BEGIN
 BEGIN
   INSERT INTO public.docket_bill_source_document
   (source_document_key,source_bill_id,provider_document_id,document_family,
    provider_document_type,normalized_version_type,provider_sequence,
    stage_rank,source_url,base_source_document_key,latest_metadata,
    latest_observed_at)
   VALUES ('amendment:1900000001:3000003',1900000001,3000003,
           'amendment','House Amendment','house_amendment',3,250,
           'https://example.invalid/cross-bill',
           'text:1900000000:9000000',
           jsonb_build_object(
             'relationship_basis','official_explicit_reference',
             'attachment_evidence_hash',repeat('e',64),
             'base_source_content_hash',repeat('f',64)),now());
   RAISE EXCEPTION 'FAIL: cross-bill base accepted';
 EXCEPTION WHEN check_violation THEN
   RAISE NOTICE 'PASS: cross-bill base blocked';
 END;
END
$negative_cross_bill$;

-- POSITIVE: a new same-bill amendment with explicit evidence receipt passes
-- the structural metadata gate; source text and evidence still require
-- independent validation by the actual source-completion service.
INSERT INTO public.docket_bill_source_document
  (source_document_key,source_bill_id,provider_document_id,document_family,
   provider_document_type,normalized_version_type,provider_sequence,
   stage_rank,source_url,base_source_document_key,latest_metadata,
   latest_observed_at)
VALUES ('amendment:1900000000:3000004',1900000000,3000004,
        'amendment','House Amendment','house_amendment',4,250,
        'https://example.invalid/explicit-receipt',
        'text:1900000000:9000000',
        jsonb_build_object(
          'relationship_basis','official_explicit_reference',
          'attachment_evidence_hash',repeat('e',64),
          'base_source_content_hash',repeat('f',64)),now());

-- Direct genome-version writes are protected independently of the source
-- document. Even a source with a non-null base cannot create a version that
-- lacks its own base-version identity.
DO $negative_direct_version$
BEGIN
  BEGIN
    INSERT INTO public.civic_genome_bill_version
      (genome_bill_id,source_document_key,source_bill_id,document_family,
       version_type,provider_sequence,stage_rank,version_fingerprint)
    SELECT g.genome_bill_id,'amendment:1900000000:3000004',
           1900000000,'amendment','house_amendment',4,250,repeat('e',64)
    FROM public.civic_genome_bill g
    WHERE g.structural_dna_json->>'source_bill_id'='1900000000';
    RAISE EXCEPTION 'FAIL: direct unbased genome version admitted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: direct unbased genome version rejected';
  END;
END
$negative_direct_version$;

-- The archived source remains available, including a still-unattached
-- amendment. Its mention must not recreate a derived unbased record.
UPDATE public.docket_bill_detail_cache
  SET bill=jsonb_set(
    bill,'{amendments}',
    '[{"amendment_id":2000001,"title":"Unbased original source",
       "chamber":"H","url":"https://example.invalid/unbased"},
      {"amendment_id":1000001,"title":"Existing attached metadata",
       "chamber":"H","url":"https://example.invalid/linked"}]'::jsonb
  )
WHERE bill_id=1900000000;

-- Exercise the canonical registration explicitly after the cache trigger.
SELECT public.register_docket_legislative_version_spine(1900000000,false)
  AS registration_receipt;

DO $no_reentry$
BEGIN
 IF EXISTS (SELECT 1 FROM public.docket_bill_source_document
            WHERE document_family='amendment'
              AND base_source_document_key IS NULL)
    OR EXISTS (SELECT 1 FROM public.civic_genome_bill_version
               WHERE document_family='amendment'
                 AND base_bill_version_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.docket_bill_source_document
               WHERE source_document_key='amendment:1900000000:2000001')
    OR NOT EXISTS (
       SELECT 1 FROM public.docket_bill_detail_cache
       WHERE bill_id=1900000000
         AND jsonb_array_length(bill->'amendments')=2
         AND bill->>'fixture_original_legislative_source'='true'
    )
    OR (SELECT count(*) FROM public.docket_bill_source_document
        WHERE document_family='amendment'
          AND base_source_document_key IS NOT NULL)<>2102
 THEN
  RAISE EXCEPTION 'Unbased source was re-admitted or valid fixture source lost';
 END IF;
 RAISE NOTICE 'PASS: cache trigger and explicit registration do not recreate unbased amendments; original source preserved';
END
$no_reentry$;

-- A separately admitted, evidence-shaped, same-bill amendment can
-- acquire its base version; it is still not eligible without the independent
-- finished attachment receipt.
DO $positive_derived_version$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.civic_genome_bill_version amended
    JOIN public.civic_genome_bill_version base
      ON base.bill_version_id=amended.base_bill_version_id
    WHERE amended.source_document_key='amendment:1900000000:3000004'
      AND base.source_document_key='text:1900000000:9000000'
  ) THEN
    RAISE EXCEPTION 'Evidence-linked amendment was not registered with its base';
  END IF;
  RAISE NOTICE 'PASS: evidence-linked amendment version carries exact base ID';
END
$positive_derived_version$;

-- The 2,101 historical source-stem-linked amendments have no independently
-- verified amendment_attachment_v1 receipts. Registration must NOT queue them.
SELECT public.register_docket_legislative_version_spine(1900000000,true)
  AS safe_registration_no_unverified_amendment_queue;

DO $no_guess_queue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.civic_genome_legislative_version_queue q
    JOIN public.civic_genome_bill_version v USING(bill_version_id)
    WHERE v.document_family='amendment' AND q.queue_state='eligible'
      AND v.genome_bill_id=(
        SELECT genome_bill_id FROM public.civic_genome_bill
        WHERE structural_dna_json->>'source_bill_id'='1900000000'
      )
  ) THEN
    RAISE EXCEPTION 'Unverified legacy base link became eligible';
  END IF;
  RAISE NOTICE 'PASS: unverified historic base links do not re-enter eligible queue on registration';
END
$no_guess_queue$;

-- The independent base-content wake trigger is a second potential route.
-- A recognized text content hash must not wake a guessed amendment base.
INSERT INTO public.civic_genome_legislative_version_queue
  (bill_version_id,queue_state,next_attempt_at,last_failure_class)
SELECT bill_version_id,'degraded','infinity'::timestamptz,'awaiting_amendment_base'
FROM public.civic_genome_bill_version
WHERE source_document_key='amendment:1900000000:1000001'
ON CONFLICT (bill_version_id) DO NOTHING;

UPDATE public.civic_genome_bill_version
  SET receipt_json=receipt_json ||
    jsonb_build_object('source_content_hash',repeat('c',64))
WHERE source_document_key='text:1900000000:9000000';

DO $no_unverified_wake$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.civic_genome_legislative_version_queue q
    JOIN public.civic_genome_bill_version v USING(bill_version_id)
    WHERE v.source_document_key='amendment:1900000000:1000001'
      AND q.queue_state='degraded'
      AND q.last_failure_class='awaiting_amendment_base'
      AND q.next_attempt_at='infinity'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Unverified legacy amendment was incorrectly woken';
  END IF;
  RAISE NOTICE 'PASS: text base arrival does not wake unverified legacy amendment';
END
$no_unverified_wake$;
