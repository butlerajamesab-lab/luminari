-- Rights & Obligations checklist scaffold (blueprint Tier 1, "three trays").
-- Unnests latest-version workflow trait steps into deterministic checklist rows.
-- Tray assignment is verb-primary (exact modal), actor_kind is lexicon-secondary.
-- No interpretation: rows carry the extracted step text + provenance fingerprint.

CREATE OR REPLACE VIEW public.docket_bill_obligation_checklist AS
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
  s.step->>'step_id'         AS step_id,
  (s.step->>'step_order')::integer AS step_order,
  s.step->>'verb'            AS verb,
  s.step->>'actor'           AS actor,
  s.step->>'step_name'       AS step_text,
  s.step->>'governing_section' AS governing_section,
  CASE
    WHEN s.step->>'verb' IN ('may') THEN 'right_or_option'
    WHEN s.step->>'verb' IN ('may not', 'shall not', 'must not') THEN 'prohibition'
    WHEN s.step->>'verb' IN ('shall', 'must') THEN 'mandate'
    ELSE 'unclassified'
  END AS tray,
  CASE
    WHEN s.step->>'actor' IS NULL THEN 'unknown'
    WHEN s.step->>'actor' ~* 'department|commission|agency|state|county|counties|treasurer|assessor|legislature|board|court|officer|official|superintendent|sheriff|chief|marshal|committee|authority|district|municipal|city|town|tribal|tribe' THEN 'institution'
    ELSE 'person_or_other'
  END AS actor_kind,
  t.trait_fingerprint,
  t.extraction_run_id,
  t.methodology_version
FROM public.civic_genome_trait t
JOIN latest l ON l.genome_bill_id = t.genome_bill_id
JOIN bill_map bm ON bm.genome_bill_id = t.genome_bill_id
CROSS JOIN LATERAL jsonb_array_elements(t.normalized_value_json->'steps') AS s(step)
WHERE t.trait_class = 'workflow'
  AND EXISTS (
    SELECT 1 FROM public.civic_genome_prism_verification_binding b
    WHERE b.trait_id = t.trait_id
      AND b.assembly_run_id = l.assembly_run_id
  );

COMMENT ON VIEW public.docket_bill_obligation_checklist IS
  'Three-tray checklist scaffold (right_or_option / prohibition / mandate) from latest-version workflow steps. Verb-primary classification; actor_kind is lexicon v1 and actor may be NULL (unknown). Rows carry extracted text and provenance only.';
