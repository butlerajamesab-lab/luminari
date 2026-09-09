-- Impact callouts (blueprint Tier 1): latest-version override traits as
-- display-ready callout rows. Neutral labels only — the platform reveals
-- structure; it does not editorialize ("Judge nothing"). Every row carries
-- its trait fingerprint + extraction run for provenance drill-down.

CREATE OR REPLACE VIEW public.docket_bill_impact_callouts AS
WITH latest AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, bill_version_id, assembly_run_id
  FROM public.civic_genome_bill_version
  ORDER BY genome_bill_id, stage_rank DESC NULLS LAST, provider_sequence DESC NULLS LAST
),
bill_map AS (
  SELECT DISTINCT genome_bill_id, state_code, source_bill_id
  FROM public.civic_genome_lifecycle_event_v2
)
SELECT
  bm.state_code,
  bm.source_bill_id AS bill_id,
  t.genome_bill_id,
  t.trait_id,
  t.trait_key,
  CASE t.normalized_value_json->>'override_type'
    WHEN 'source_stated_exception' THEN 'exception'
    WHEN 'source_stated_condition' THEN 'condition'
    WHEN 'source_stated_limitation' THEN 'limitation'
    WHEN 'source_stated_amendment_operation' THEN 'amendment_operation'
    ELSE 'unclassified'
  END AS callout_type,
  t.normalized_value_json->>'override_condition'   AS condition_text,
  t.normalized_value_json->>'override_scope'       AS scope_text,
  t.normalized_value_json->>'overridden_authority' AS overridden_authority,
  t.normalized_value_json->>'governing_section'    AS governing_section,
  t.normalized_value_json->>'granting_actor'       AS granting_actor,
  t.normalized_value_json->>'temporal_status'      AS temporal_status,
  t.trait_fingerprint,
  t.extraction_run_id,
  t.methodology_version
FROM public.civic_genome_trait t
JOIN latest l ON l.genome_bill_id = t.genome_bill_id
JOIN bill_map bm ON bm.genome_bill_id = t.genome_bill_id
WHERE t.trait_class = 'override'
  AND EXISTS (
    SELECT 1 FROM public.civic_genome_prism_verification_binding b
    WHERE b.trait_id = t.trait_id
      AND b.assembly_run_id = l.assembly_run_id
  );

COMMENT ON VIEW public.docket_bill_impact_callouts IS
  'Latest-version override traits rendered as callout rows (exception / condition / limitation / amendment_operation). Raw quoted fields only; UI displays text + provenance, never interpretation.';
