-- Repository-only Docket ordering substrate.
-- Derives each bill's newest actual action date from provider history, then
-- indexes the archive order and session selectors. This does not mutate bill
-- receipts, perform provider calls, or publish Genome/Rosetta results.
CREATE OR REPLACE FUNCTION public.docket_bill_latest_action_date_v1(p_bill jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT max(action_date)
  FROM (
    SELECT p_bill->>'last_action_date' AS action_date
    UNION ALL
    SELECT history_item->>'date' AS action_date
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_bill->'history') = 'array' THEN p_bill->'history'
        ELSE '[]'::jsonb
      END
    ) AS history_item
  ) AS action_dates
  WHERE action_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2};
$function$;

DO $preflight$
BEGIN
  IF to_regclass('public.docket_bill_detail_cache') IS NULL
    OR to_regclass('public.docket_bill_state_cache') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_pkey') IS NULL THEN
    RAISE EXCEPTION 'docket_history_session_ordering_preflight_failed';
  END IF;
END;
$preflight$;

-- Global browse order. NULL dates fall behind dated source history.
CREATE INDEX docket_bill_detail_cache_action_date_public_idx
ON public.docket_bill_detail_cache (
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

-- State-scoped browse order.
CREATE INDEX docket_bill_detail_cache_state_action_date_public_idx
ON public.docket_bill_detail_cache (
  (upper(coalesce(bill->>'state',''))),
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

-- Session-scoped browse and session selector.
CREATE INDEX docket_bill_detail_cache_state_session_action_public_idx
ON public.docket_bill_detail_cache (
  (upper(coalesce(bill->>'state',''))),
  (bill->>'session_id'),
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

DO $postflight$
BEGIN
  IF to_regprocedure('public.docket_bill_latest_action_date_v1(jsonb)') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_action_date_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_state_action_date_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_state_session_action_public_idx') IS NULL THEN
    RAISE EXCEPTION 'docket_history_session_ordering_postflight_failed';
  END IF;
END;
$postflight$;
;
$function$;

DO $preflight$
BEGIN
  IF to_regclass('public.docket_bill_detail_cache') IS NULL
    OR to_regclass('public.docket_bill_state_cache') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_pkey') IS NULL THEN
    RAISE EXCEPTION 'docket_history_session_ordering_preflight_failed';
  END IF;
END;
$preflight$;

-- Global browse order. NULL dates fall behind dated source history.
CREATE INDEX docket_bill_detail_cache_action_date_public_idx
ON public.docket_bill_detail_cache (
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

-- State-scoped browse order.
CREATE INDEX docket_bill_detail_cache_state_action_date_public_idx
ON public.docket_bill_detail_cache (
  (upper(coalesce(bill->>'state',''))),
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

-- Session-scoped browse and session selector.
CREATE INDEX docket_bill_detail_cache_state_session_action_public_idx
ON public.docket_bill_detail_cache (
  (upper(coalesce(bill->>'state',''))),
  (bill->>'session_id'),
  public.docket_bill_latest_action_date_v1(bill) DESC NULLS LAST,
  bill_id ASC
);

DO $postflight$
BEGIN
  IF to_regprocedure('public.docket_bill_latest_action_date_v1(jsonb)') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_action_date_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_state_action_date_public_idx') IS NULL
    OR to_regclass('public.docket_bill_detail_cache_state_session_action_public_idx') IS NULL THEN
    RAISE EXCEPTION 'docket_history_session_ordering_postflight_failed';
  END IF;
END;
$postflight$;
