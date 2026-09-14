-- A class that existed in the base but has zero traits in the latest version
-- is still a covered drift row. Build the output over the union of base and
-- latest classes so removals cannot disappear from the read model.
CREATE OR REPLACE VIEW public.docket_bill_drift_delta AS
WITH version_traits AS (
  SELECT DISTINCT bv.genome_bill_id, bv.bill_version_id, bv.stage_rank,
    bv.provider_sequence, bv.base_bill_version_id, t.trait_class, t.trait_id
  FROM public.civic_genome_bill_version bv
  JOIN public.civic_genome_prism_verification_binding b
    ON b.assembly_run_id = bv.assembly_run_id
  JOIN public.civic_genome_trait t ON t.trait_id = b.trait_id
), class_counts AS (
  SELECT genome_bill_id, bill_version_id, trait_class, COUNT(*) AS n
  FROM version_traits GROUP BY 1, 2, 3
), latest AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, bill_version_id, base_bill_version_id
  FROM public.civic_genome_bill_version
  ORDER BY genome_bill_id, stage_rank DESC NULLS LAST, provider_sequence DESC NULLS LAST
), base_coverage AS (
  SELECT bill_version_id, TRUE AS has_trait_coverage
  FROM class_counts GROUP BY bill_version_id
), covered_classes AS (
  SELECT l.genome_bill_id, l.bill_version_id AS latest_bill_version_id,
    l.base_bill_version_id, cc.trait_class
  FROM latest l
  JOIN class_counts cc
    ON cc.bill_version_id IN (l.bill_version_id, l.base_bill_version_id)
  GROUP BY 1, 2, 3, 4
)
SELECT c.genome_bill_id, c.trait_class,
  COALESCE(cb.n, 0) AS base_count,
  COALESCE(cl.n, 0) AS latest_count,
  COALESCE(cl.n, 0) - COALESCE(cb.n, 0) AS delta,
  COALESCE(bc.has_trait_coverage, FALSE) AS base_has_trait_coverage
FROM covered_classes c
LEFT JOIN class_counts cb
  ON cb.bill_version_id = c.base_bill_version_id AND cb.trait_class = c.trait_class
LEFT JOIN class_counts cl
  ON cl.bill_version_id = c.latest_bill_version_id AND cl.trait_class = c.trait_class
LEFT JOIN base_coverage bc ON bc.bill_version_id = c.base_bill_version_id;

COMMENT ON VIEW public.docket_bill_drift_delta IS
  'Per-bill trait-class structural delta over the union of base and latest classes. Removed classes emit latest_count=0. base_has_trait_coverage=FALSE means drift must not be claimed.';
