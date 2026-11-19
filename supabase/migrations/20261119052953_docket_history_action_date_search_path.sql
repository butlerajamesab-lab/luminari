-- Pin the action-date helper's lookup path after the production advisor flagged
-- a mutable search_path on this immutable, invoker-context SQL function.
ALTER FUNCTION public.docket_bill_latest_action_date_v1(jsonb)
  SET search_path = pg_catalog, public;
