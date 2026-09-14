-- Completed Prism coverage includes both clean verification and verification
-- with substantive findings. Findings affect interpretation, not whether the
-- version was fully analyzed.
CREATE OR REPLACE VIEW public.docket_bill_drift_delta AS
WITH version_traits AS (
  SELECT DISTINCT bv.genome_bill_id, bv.bill_version_id, t.trait_class, t.trait_id
  FROM public.civic_genome_bill_version bv
  JOIN public.civic_genome_prism_verification_binding b
    ON b.assembly_run_id = bv.assembly_run_id
  JOIN public.civic_genome_trait t ON t.trait_id = b.trait_id
), class_counts AS (
  SELECT genome_bill_id, bill_version_id, trait_class, COUNT(*) AS n
  FROM version_traits GROUP BY 1, 2, 3
), latest AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, bill_version_id
  FROM public.civic_genome_bill_version
  ORDER BY genome_bill_id, stage_rank DESC NULLS LAST, provider_sequence DESC NULLS LAST
), base AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, base_bill_version_id
  FROM public.civic_genome_bill_version
  WHERE base_bill_version_id IS NOT NULL
  ORDER BY genome_bill_id, created_at ASC
), extraction_coverage AS (
  SELECT bill_version_id, TRUE AS has_trait_coverage
  FROM public.civic_genome_bill_version
  WHERE processing_state IN ('verified', 'verified_with_findings')
    AND assembly_run_id IS NOT NULL
    AND prism_verification_run_id IS NOT NULL
), covered_classes AS (
  SELECT l.genome_bill_id, l.bill_version_id AS latest_bill_version_id,
    b.base_bill_version_id, cc.trait_class
  FROM latest l
  LEFT JOIN base b ON b.genome_bill_id = l.genome_bill_id
  JOIN class_counts cc
    ON cc.bill_version_id IN (l.bill_version_id, b.base_bill_version_id)
  GROUP BY 1, 2, 3, 4
)
SELECT c.genome_bill_id, c.trait_class,
  COALESCE(cb.n, 0) AS base_count,
  COALESCE(cl.n, 0) AS latest_count,
  COALESCE(cl.n, 0) - COALESCE(cb.n, 0) AS delta,
  COALESCE(bc.has_trait_coverage, FALSE) AS base_has_trait_coverage,
  COALESCE(lc.has_trait_coverage, FALSE) AS latest_has_trait_coverage
FROM covered_classes c
LEFT JOIN class_counts cb
  ON cb.bill_version_id = c.base_bill_version_id AND cb.trait_class = c.trait_class
LEFT JOIN class_counts cl
  ON cl.bill_version_id = c.latest_bill_version_id AND cl.trait_class = c.trait_class
LEFT JOIN extraction_coverage bc ON bc.bill_version_id = c.base_bill_version_id
LEFT JOIN extraction_coverage lc ON lc.bill_version_id = c.latest_bill_version_id;

COMMENT ON VIEW public.docket_bill_drift_delta IS
  'Per-bill trait-class drift over the base/latest class union. Base resolves independently; clean and findings-bearing completed verification both count as coverage; consumers require both coverage flags.';
