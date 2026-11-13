-- DISPOSABLE DATABASE ONLY; NEVER run against production.
-- Build a deterministic population matching the exact protected deletion
-- cohort: 7,264 unbased derived amendments, 2,101 legacy structurally linked,
-- 4,942 unbased queue rows, 7,438 unbased observations, 3,783 historical
-- Rosetta source ID references. No production rows or secrets are copied.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '180s';

INSERT INTO public.docket_bill_detail_cache
  (bill_id,bill,fetched_at,source)
VALUES (
  1900000000,
  '{"bill_id":1900000000,"bill_number":"AB999",
    "state":"NV","session_id":2999,"history":[],
    "texts":[],"amendments":[],"fixture_original_legislative_source":true}'::jsonb,
  now(),'legiscan_bulk_json'
);

INSERT INTO public.civic_genome_family (family_key,family_label,policy_domain)
VALUES ('ci:unbased-amendment-removal','Disposable amendment proof','legislative');

INSERT INTO public.civic_genome_bill
  (family_id,bill_id,state_code,session_key,source_bill_number,
   source_bill_title,source_bill_url,bill_status,
   structural_dna_hash,structural_dna_json)
SELECT f.family_id,gen_random_uuid(),'NV','2999','AB999',
       'Synthetic bill; disposable data only',
       'https://example.invalid/legislation/AB999',
       'prefiled',repeat('c',64),
       jsonb_build_object('source_bill_id',1900000000)
FROM public.civic_genome_family f
WHERE f.family_key='ci:unbased-amendment-removal';

INSERT INTO public.docket_bill_source_document
  (source_document_key,source_bill_id,provider_document_id,
   document_family,provider_document_type,normalized_version_type,
   provider_sequence,stage_rank,source_url,latest_observed_at)
VALUES ('text:1900000000:9000000',1900000000,9000000,
        'text','Introduced','introduced',1,100,
        'https://example.invalid/legislation/AB999/introduced',now());

INSERT INTO public.civic_genome_bill_version
  (genome_bill_id,source_document_key,source_bill_id,document_family,
   version_type,provider_sequence,stage_rank,version_fingerprint)
SELECT g.genome_bill_id,'text:1900000000:9000000',1900000000,
       'text','introduced',1,100,repeat('d',64)
FROM public.civic_genome_bill g
WHERE g.structural_dna_json->>'source_bill_id'='1900000000';

-- 2,101 records have legacy base pointers (NOT necessarily source-verified).
INSERT INTO public.docket_bill_source_document
  (source_document_key,source_bill_id,provider_document_id,
   document_family,provider_document_type,normalized_version_type,
   provider_sequence,stage_rank,source_url,base_source_document_key,
   latest_observed_at)
SELECT 'amendment:1900000000:'||(1000000+s.n),
       1900000000,1000000+s.n,'amendment','House Amendment',
       'house_amendment',s.n,250,
       'https://example.invalid/legislation/AB999/linked/'||s.n,
       'text:1900000000:9000000',now()
FROM generate_series(1,2101) AS s(n);

-- 7,264 records have NO base; the migration must DELETE these derived rows.
INSERT INTO public.docket_bill_source_document
  (source_document_key,source_bill_id,provider_document_id,
   document_family,provider_document_type,normalized_version_type,
   provider_sequence,stage_rank,source_url,latest_observed_at)
SELECT 'amendment:1900000000:'||(2000000+s.n),
       1900000000,2000000+s.n,'amendment','House Amendment',
       'house_amendment',s.n,250,
       'https://example.invalid/legislation/AB999/unbased/'||s.n,now()
FROM generate_series(1,7264) AS s(n);

-- Link the 2,101 structurally based versions to their text version; retain
-- historical IDs only on the first 3,783 UNBASED versions.
INSERT INTO public.civic_genome_bill_version
  (genome_bill_id,source_document_key,source_bill_id,document_family,
   version_type,provider_sequence,stage_rank,version_fingerprint,
   base_bill_version_id,rosetta_source_document_id)
SELECT g.genome_bill_id,d.source_document_key,d.source_bill_id,
       'amendment',d.normalized_version_type,
       d.provider_sequence,d.stage_rank,
       encode(extensions.digest(convert_to(d.source_document_key,'UTF8'),'sha256'),'hex'),
       CASE WHEN d.base_source_document_key IS NOT NULL
            THEN base.bill_version_id ELSE NULL END,
       CASE WHEN d.provider_document_id BETWEEN 2000001 AND 2003783
            THEN (3000000+d.provider_document_id)::bigint ELSE NULL END
FROM public.docket_bill_source_document d
JOIN public.civic_genome_bill g
  ON g.structural_dna_json->>'source_bill_id'=d.source_bill_id::text
LEFT JOIN public.civic_genome_bill_version base
  ON base.source_document_key=d.base_source_document_key
WHERE d.document_family='amendment'
  AND d.source_bill_id=1900000000;

INSERT INTO public.docket_bill_source_document_observation
  (source_document_key,metadata_hash,metadata_json,docket_fetched_at)
SELECT d.source_document_key,
       encode(extensions.digest(convert_to('primary:'||d.source_document_key,'UTF8'),'sha256'),'hex'),
       jsonb_build_object('source','disposable_fixture','observation',1),
       now()
FROM public.docket_bill_source_document d
WHERE d.source_bill_id=1900000000 AND d.document_family='amendment'
  AND d.base_source_document_key IS NULL;

-- 174 additional observations (7,264+174=7,438).
INSERT INTO public.docket_bill_source_document_observation
  (source_document_key,metadata_hash,metadata_json,docket_fetched_at)
SELECT d.source_document_key,
       encode(extensions.digest(convert_to('additional:'||d.source_document_key,'UTF8'),'sha256'),'hex'),
       jsonb_build_object('source','disposable_fixture','observation',2),
       now()
FROM public.docket_bill_source_document d
WHERE d.source_bill_id=1900000000 AND d.document_family='amendment'
  AND d.provider_document_id BETWEEN 2000001 AND 2000174;

INSERT INTO public.civic_genome_legislative_version_queue
  (bill_version_id,queue_state)
SELECT v.bill_version_id,'degraded'
FROM public.civic_genome_bill_version v
JOIN public.docket_bill_source_document d USING(source_document_key)
WHERE d.document_family='amendment'
  AND d.source_bill_id=1900000000
  AND d.provider_document_id BETWEEN 2000001 AND 2004942;

DO $manifest$
DECLARE
 u integer; b integer; o integer; q integer; r integer;
BEGIN
 SELECT count(*) INTO u FROM public.docket_bill_source_document
 WHERE document_family='amendment' AND base_source_document_key IS NULL;
 SELECT count(*) INTO b FROM public.docket_bill_source_document
 WHERE document_family='amendment' AND base_source_document_key IS NOT NULL;
 SELECT count(*) INTO o FROM public.docket_bill_source_document_observation
 WHERE source_document_key LIKE 'amendment:1900000000:2%';
 SELECT count(*) INTO q FROM public.civic_genome_legislative_version_queue x
 JOIN public.civic_genome_bill_version v USING(bill_version_id)
 WHERE v.document_family='amendment' AND v.base_bill_version_id IS NULL;
 SELECT count(*) INTO r FROM public.civic_genome_bill_version
 WHERE document_family='amendment' AND base_bill_version_id IS NULL
   AND rosetta_source_document_id IS NOT NULL;
 IF u<>7264 OR b<>2101 OR o<>7438 OR q<>4942 OR r<>3783
 THEN RAISE EXCEPTION 'Disposable seed mismatch u %, b %, o %, q %, r %',u,b,o,q,r;
 END IF;
 RAISE NOTICE 'PASS: populated synthetic preimage matches production cohort counts';
END
$manifest$;
COMMIT;
