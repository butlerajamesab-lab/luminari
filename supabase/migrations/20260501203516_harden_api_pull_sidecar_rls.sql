-- Harden only the API Pull Sidecar objects created in the prior migration.
-- No data changes. No bridge-table changes. No existing app-core table changes.

-- 1. Fix function search_path warnings for sidecar helper functions.
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION api_pull_run_security_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  forbidden text[] := array['service_role','authorization','bearer','api key','api_key','secret','token','password'];
  key text;
BEGIN
  IF NEW.request_params IS NOT NULL THEN
    FOR key IN SELECT jsonb_object_keys(NEW.request_params) LOOP
      IF lower(key) = ANY(forbidden) THEN
        RAISE EXCEPTION 'Security violation: forbidden key "%" in request_params for run_key=%', key, NEW.run_key;
      END IF;
    END LOOP;
  END IF;

  IF NEW.request_headers_safe IS NOT NULL THEN
    FOR key IN SELECT jsonb_object_keys(NEW.request_headers_safe) LOOP
      IF lower(key) = ANY(forbidden) THEN
        RAISE EXCEPTION 'Security violation: forbidden key "%" in request_headers_safe for run_key=%', key, NEW.run_key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Enable RLS on sidecar tables. No policies are added intentionally.
-- Service-role/backend access continues to work; anon/authenticated direct table access is blocked.
ALTER TABLE api_source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_pull_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_api_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalized_civic_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_signals_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_source_link ENABLE ROW LEVEL SECURITY;

-- 3. Revoke direct privileges from browser-facing roles for sidecar tables and views.
REVOKE ALL ON TABLE api_source_registry FROM anon, authenticated;
REVOKE ALL ON TABLE api_pull_run FROM anon, authenticated;
REVOKE ALL ON TABLE raw_api_record FROM anon, authenticated;
REVOKE ALL ON TABLE normalized_civic_resource FROM anon, authenticated;
REVOKE ALL ON TABLE detected_signals_v2 FROM anon, authenticated;
REVOKE ALL ON TABLE signal_source_link FROM anon, authenticated;

REVOKE ALL ON TABLE v_unproven_atlas_signal_claims FROM anon, authenticated;
REVOKE ALL ON TABLE v_lighthouse_native_signals FROM anon, authenticated;
REVOKE ALL ON TABLE v_api_pull_provenance_summary FROM anon, authenticated;

-- 4. Make sidecar views run with invoker permissions where supported.
ALTER VIEW v_unproven_atlas_signal_claims SET (security_invoker = true);
ALTER VIEW v_lighthouse_native_signals SET (security_invoker = true);
ALTER VIEW v_api_pull_provenance_summary SET (security_invoker = true);
