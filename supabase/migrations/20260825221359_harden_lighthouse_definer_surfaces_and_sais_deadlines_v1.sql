-- Supabase migration-ledger version: 20260825221359.
-- Narrow forward-only repair for the remaining Lighthouse security-advisor
-- findings. This intentionally does not repeat the broad 20260816091700
-- migration that was rolled back: only the six currently flagged views, the
-- SAIS deadline table, and the one mutable-path predicate are changed.

ALTER VIEW public.v_lighthouse_resource_catalog_v1
  SET (security_invoker = true);
ALTER VIEW public.v_lighthouse_did_you_know_candidates_v1
  SET (security_invoker = true);
ALTER VIEW public.v_lighthouse_signal_catalog_v1
  SET (security_invoker = true);
ALTER VIEW public.v_lighthouse_legal_catalog_v1
  SET (security_invoker = true);
ALTER VIEW public.v_luminari_resource_locations_current_v3_13
  SET (security_invoker = true);
ALTER VIEW public.v_registry_resources_unified
  SET (security_invoker = true);

-- These projections are consumed by the trusted server/database connection.
-- Browser roles must not query the views directly and thereby depend on their
-- underlying tables' privilege or RLS posture.
REVOKE ALL PRIVILEGES ON TABLE
  public.v_lighthouse_resource_catalog_v1,
  public.v_lighthouse_did_you_know_candidates_v1,
  public.v_lighthouse_signal_catalog_v1,
  public.v_lighthouse_legal_catalog_v1,
  public.v_luminari_resource_locations_current_v3_13,
  public.v_registry_resources_unified
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.v_lighthouse_resource_catalog_v1,
  public.v_lighthouse_did_you_know_candidates_v1,
  public.v_lighthouse_signal_catalog_v1,
  public.v_lighthouse_legal_catalog_v1,
  public.v_luminari_resource_locations_current_v3_13,
  public.v_registry_resources_unified
TO service_role;

-- SAIS deadline facts are source evidence, not a browser-writable surface.
-- service_role may ingest and reconcile them but cannot delete or truncate
-- them through its table grant.
ALTER TABLE public.sais_resource_deadlines ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.sais_resource_deadlines
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sais_resource_deadlines
  TO service_role;

-- This predicate is deliberately invoker-safe and data-free. Pinning its path
-- removes name-resolution ambiguity without changing its execution grants.
ALTER FUNCTION public.reviewed_route_verification_is_positive_v1(text)
  SET search_path = pg_catalog;
