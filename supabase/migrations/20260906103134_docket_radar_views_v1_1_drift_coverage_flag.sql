-- Patch: drift delta must distinguish "base extracted, zero traits" from
-- "base never extracted". Without the flag, an unprocessed base masquerades
-- as a from-zero drift. Display layer must show coverage, not imply it.

CREATE OR REPLACE VIEW public.docket_bill_drift_delta AS
WITH version_traits AS (
  SELECT DISTINCT
    bv.genome_bill_id, bv.bill_version_id, bv.stage_rank, bv.provider_sequence,
    bv.base_bill_version_id, t.trait_class, t.trait_id
  FROM public.civic_genome_bill_version bv
  JOIN public.civic_genome_prism_verification_binding b
    ON b.assembly_run_id = bv.assembly_run_id
  JOIN public.civic_genome_trait t
    ON t.trait_id = b.trait_id
),
class_counts AS (
  SELECT genome_bill_id, bill_version_id, stage_rank, provider_sequence,
         base_bill_version_id, trait_class, COUNT(*) AS n
  FROM version_traits
  GROUP BY 1, 2, 3, 4, 5, 6
),
latest AS (
  SELECT DISTINCT ON (genome_bill_id) genome_bill_id, bill_version_id
  FROM public.civic_genome_bill_version
  ORDER BY genome_bill_id, stage_rank DESC NULLS LAST, provider_sequence DESC NULLS LAST
),
base AS (
  SELECT DISTINCT genome_bill_id, base_bill_version_id
  FROM public.civic_genome_bill_version
  WHERE base_bill_version_id IS NOT NULL
),
base_coverage AS (
  SELECT bill_version_id, TRUE AS has_trait_coverage
  FROM class_counts
  GROUP BY bill_version_id
)
SELECT
  l.genome_bill_id,
  cl.trait_class,
  COALESCE(cb.n, 0) AS base_count,
  cl.n AS latest_count,
  cl.n - COALESCE(cb.n, 0) AS delta,
  COALESCE(bc.has_trait_coverage, FALSE) AS base_has_trait_coverage
FROM latest l
JOIN class_counts cl ON cl.bill_version_id = l.bill_version_id
LEFT JOIN base b ON b.genome_bill_id = l.genome_bill_id
LEFT JOIN class_counts cb
  ON cb.bill_version_id = b.base_bill_version_id
 AND cb.trait_class = cl.trait_class
LEFT JOIN base_coverage bc ON bc.bill_version_id = b.base_bill_version_id;

COMMENT ON VIEW public.docket_bill_drift_delta IS
  'Per-bill trait-class structural delta: latest version vs introduced base. base_has_trait_coverage=FALSE means the base version was never extracted; delta is then total latest counts, NOT drift, and must be displayed as such.';
