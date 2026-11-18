-- Repository-only candidate: indexes for public, read-only Docket corpus discovery.
-- The canonical 212k+ bills are already in public.docket_bill_detail_cache.
-- This migration does NOT import, rewrite, register, publish or delete bills;
-- source version receipts, queues and Rosetta/Prism remain untouched.
-- No production execution without exact-head test/review and separate approval.
-- Guard against different table shape or missing pg_trgm.
DO $preflight$
BEGIN
  IF to_regclass('public.docket_bill_detail_cache') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_pkey') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm') THEN
    RAISE EXCEPTION 'docket_corpus_public_read_preflight_failed';
  END IF;
END;
$preflight$;

-- Keyset paging by jurisdiction. Global paging already uses the PK (bill_id).
CREATE INDEX docket_bill_detail_cache_state_bill_id_public_idx
ON public.docket_bill_detail_cache (
  (upper(bill ->> 'state')), bill_id
);

-- Exact public-facing bill-number search: HB1000, HB 1000, etc.
CREATE INDEX docket_bill_detail_cache_normalized_number_public_idx
ON public.docket_bill_detail_cache (
  (upper(regexp_replace(
    upper(coalesce(bill ->> 'bill_number', bill ->> 'number', '')),
    '[^A-Z0-9]', '', 'g'
  )))
);

-- Ordinary title/keyword lookup. Trigram index prevents full-corpus JSON scans.
CREATE INDEX docket_bill_detail_cache_title_trgm_public_idx
ON public.docket_bill_detail_cache
USING gin ((coalesce(bill ->> 'title', '')) extensions.gin_trgm_ops);

DO $postflight$
BEGIN
  IF to_regclass('public.docket_bill_detail_cache_state_bill_id_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_normalized_number_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_title_trgm_public_idx') IS NULL THEN
    RAISE EXCEPTION 'docket_corpus_public_read_indexes_missing';
  END IF;
END;
$postflight$;
