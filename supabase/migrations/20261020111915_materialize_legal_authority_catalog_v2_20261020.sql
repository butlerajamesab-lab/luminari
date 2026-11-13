-- Serve the legal authority catalog from a materialized snapshot instead of
-- recomputing a ~240k-row window sort on every request.
-- Reversible: DROP MATERIALIZED VIEW public.v_lighthouse_legal_authority_catalog_v2;
--             ALTER VIEW public.v_lighthouse_legal_authority_catalog_v2_live RENAME TO v_lighthouse_legal_authority_catalog_v2;
--             SELECT cron.unschedule('refresh_legal_authority_catalog_v2');
SET LOCAL statement_timeout = '5min';
SET LOCAL lock_timeout = '5s';

ALTER VIEW public.v_lighthouse_legal_authority_catalog_v2
  RENAME TO v_lighthouse_legal_authority_catalog_v2_live;

CREATE MATERIALIZED VIEW public.v_lighthouse_legal_authority_catalog_v2 AS
  SELECT * FROM public.v_lighthouse_legal_authority_catalog_v2_live;

CREATE UNIQUE INDEX v_lh_legal_catalog_v2_uid_uidx
  ON public.v_lighthouse_legal_authority_catalog_v2 (civic_object_uid);
CREATE INDEX v_lh_legal_catalog_v2_class_ready_name_idx
  ON public.v_lighthouse_legal_authority_catalog_v2 (object_class, legal_catalog_ready, name, object_ref);
CREATE INDEX v_lh_legal_catalog_v2_candidate_idx
  ON public.v_lighthouse_legal_authority_catalog_v2 (source_candidate_hash, artifact_key);
CREATE INDEX v_lh_legal_catalog_v2_state_idx
  ON public.v_lighthouse_legal_authority_catalog_v2 (state_code);

ALTER MATERIALIZED VIEW public.v_lighthouse_legal_authority_catalog_v2 OWNER TO postgres;
REVOKE ALL ON public.v_lighthouse_legal_authority_catalog_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_lighthouse_legal_authority_catalog_v2 TO service_role;

ANALYZE public.v_lighthouse_legal_authority_catalog_v2;

SELECT cron.schedule(
  'refresh_legal_authority_catalog_v2',
  '*/30 * * * *',
  'refresh materialized view concurrently public.v_lighthouse_legal_authority_catalog_v2'
);
