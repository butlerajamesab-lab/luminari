-- Verifies production migration-ledger version 20260825221359.
BEGIN;

DO $verify_catalog$
DECLARE
  view_name text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'v_lighthouse_resource_catalog_v1',
    'v_lighthouse_did_you_know_candidates_v1',
    'v_lighthouse_signal_catalog_v1',
    'v_lighthouse_legal_catalog_v1',
    'v_luminari_resource_locations_current_v3_13',
    'v_registry_resources_unified'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = view_name
        AND 'security_invoker=true' = ANY(coalesce(c.reloptions, ARRAY[]::text[]))
    ) THEN
      RAISE EXCEPTION 'security_invoker_missing:%', view_name;
    END IF;

    IF has_table_privilege('anon', format('public.%I', view_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', view_name), 'SELECT')
       OR NOT has_table_privilege('service_role', format('public.%I', view_name), 'SELECT') THEN
      RAISE EXCEPTION 'view_grant_posture_invalid:%', view_name;
    END IF;
  END LOOP;

  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.sais_resource_deadlines'::regclass
  ) THEN
    RAISE EXCEPTION 'deadline_rls_not_enabled';
  END IF;

  IF has_table_privilege('anon', 'public.sais_resource_deadlines', 'SELECT')
     OR has_table_privilege('anon', 'public.sais_resource_deadlines', 'INSERT')
     OR has_table_privilege('authenticated', 'public.sais_resource_deadlines', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sais_resource_deadlines', 'INSERT') THEN
    RAISE EXCEPTION 'deadline_browser_grant_present';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.sais_resource_deadlines', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.sais_resource_deadlines', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.sais_resource_deadlines', 'UPDATE')
     OR has_table_privilege('service_role', 'public.sais_resource_deadlines', 'DELETE')
     OR has_table_privilege('service_role', 'public.sais_resource_deadlines', 'TRUNCATE') THEN
    RAISE EXCEPTION 'deadline_service_grant_posture_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reviewed_route_verification_is_positive_v1'
      AND pg_get_function_identity_arguments(p.oid) = 'status text'
      AND p.proconfig = ARRAY['search_path=pg_catalog']
  ) THEN
    RAISE EXCEPTION 'predicate_search_path_not_pinned';
  END IF;
END
$verify_catalog$;

-- Execute every protected projection under the role retained by the server.
SET LOCAL ROLE service_role;

DO $verify_runtime$
BEGIN
  PERFORM count(*) FROM public.v_lighthouse_resource_catalog_v1;
  PERFORM count(*) FROM public.v_lighthouse_did_you_know_candidates_v1;
  PERFORM count(*) FROM public.v_lighthouse_signal_catalog_v1;
  PERFORM count(*) FROM public.v_lighthouse_legal_catalog_v1;
  PERFORM count(*) FROM public.v_luminari_resource_locations_current_v3_13;
  PERFORM count(*) FROM public.v_registry_resources_unified;
  PERFORM count(*) FROM public.sais_resource_deadlines;
END
$verify_runtime$;

RESET ROLE;
SET LOCAL ROLE anon;

-- Prove denial through actual query execution, not ACL inspection alone.
DO $verify_browser_denial$
DECLARE
  object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'v_lighthouse_resource_catalog_v1',
    'v_lighthouse_did_you_know_candidates_v1',
    'v_lighthouse_signal_catalog_v1',
    'v_lighthouse_legal_catalog_v1',
    'v_luminari_resource_locations_current_v3_13',
    'v_registry_resources_unified',
    'sais_resource_deadlines'
  ] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', object_name);
      RAISE EXCEPTION 'browser_role_unexpectedly_read:%', object_name;
    EXCEPTION
      WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END
$verify_browser_denial$;

ROLLBACK;
