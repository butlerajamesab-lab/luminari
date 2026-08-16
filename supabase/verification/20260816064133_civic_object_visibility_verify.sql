-- Fail-closed verification for the Lighthouse civic-object visibility repair.
DO $verify$
DECLARE
  v_candidates bigint;
  v_visible bigint;
  v_leaked_sais bigint;
BEGIN
  SELECT count(*) INTO v_candidates FROM public.luminari_corpus_candidate_v1;
  SELECT count(*) INTO v_visible FROM public.v_civic_object_visibility_v1;
  IF v_candidates <> v_visible THEN
    RAISE EXCEPTION 'visibility cardinality mismatch: candidates %, visible %', v_candidates, v_visible;
  END IF;

  SELECT count(*) INTO v_leaked_sais
  FROM public.v_lighthouse_resource_catalog_v1 c
  JOIN public.v_sais_civic_objects_v1 s
    ON c.source_lane='sais_import' AND c.source_id=s.source_object_id
  WHERE NOT s.resource_directory_eligible;
  IF v_leaked_sais <> 0 THEN
    RAISE EXCEPTION 'non-resource SAIS objects leaked into resource catalog: %', v_leaked_sais;
  END IF;
END
$verify$;

SELECT source_family, object_kind, record_count, unresolved_or_gap_count, canonical_owner, visibility_state
FROM public.v_lighthouse_data_visibility_v1
ORDER BY source_family, object_kind;

SELECT object_class, target_surface, record_count, unresolved_count, identity_conflict_count, jurisdiction_resolved_count
FROM public.v_civic_object_visibility_summary_v1
ORDER BY record_count DESC, object_class;

SELECT service_domain, count(*) AS record_count, count(*) FILTER (WHERE has_access_point) AS accessible_count
FROM public.v_civic_resource_directory_candidates_v1
GROUP BY service_domain
ORDER BY record_count DESC, service_domain;

SELECT
  count(*) FILTER (WHERE is_current) AS current_domain3,
  count(*) FILTER (WHERE NOT is_current) AS historical_domain3,
  count(*) AS all_domain3
FROM public.live_data_signals;
